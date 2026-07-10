"""Lambda: reassign_mr — SC Manager reassigns MR to another SC member"""
import json, sys
sys.path.insert(0, "/opt/python")
from shared_utils import *

def handler(event, context):
    try:
        body          = json.loads(event.get("body","{}")) if isinstance(event.get("body"),str) else event.get("body",{})
        mr_id         = body.get("mr_id")
        new_assignee  = body.get("assigned_to","")
        reassigned_by = body.get("reassigned_by","SC Manager")

        item = get_mr(mr_id)
        if not item: return error("MR not found", 404)

        member_name = next((m["name"] for m in SC_TEAM_LIST if m["email"]==new_assignee), new_assignee)
        table = dynamodb.Table(MR_TABLE)
        table.update_item(
            Key={"mr_id": mr_id},
            UpdateExpression="SET assigned_to=:at, reassigned_by=:rb, updated_at=:ua",
            ExpressionAttributeValues={":at":new_assignee,":rb":reassigned_by,":ua":now()}
        )
        send_email(new_assignee, f"MR Assigned to You — {mr_id}",
            f"Dear {member_name},\n\nMR {mr_id} has been assigned to you by SC Manager {reassigned_by}.\n\n"
            f"Vessel: {item.get('vessel','—')}\nJob No.: {item.get('job_no','—')}\nTotal: AED {item.get('total_cost','0')}\n\n"
            f"Log in: {PORTAL_URL}" + signature("supply_chain"))

        return response({"success":True,"assigned_to":new_assignee})
    except Exception as e:
        return error(str(e), 500)
