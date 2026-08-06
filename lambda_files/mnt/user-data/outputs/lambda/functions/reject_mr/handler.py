"""Lambda: reject_mr — Manager or HOD rejection"""
import json, sys
sys.path.insert(0, "/opt/python")
from shared_utils import *

def handler(event, context):
    try:
        body      = json.loads(event.get("body","{}")) if isinstance(event.get("body"),str) else event.get("body",{})
        mr_id     = body.get("mr_id")
        rejected_by  = body.get("rejected_by","")
        reason    = body.get("reason","")

        item = get_mr(mr_id)
        if not item: return error("MR not found", 404)

        table = dynamodb.Table(MR_TABLE)
        table.update_item(
            Key={"mr_id": mr_id},
            UpdateExpression="SET #s=:s, rejected_by=:rb, rejection_reason=:rr, updated_at=:ua",
            ExpressionAttributeNames={"#s":"status"},
            ExpressionAttributeValues={":s":"REJECTED",":rb":rejected_by,":rr":reason,":ua":now()}
        )
        send_email(item["submitted_by_email"], f"MR Rejected — {mr_id}",
            f"Dear {item['submitted_by_name']},\n\nYour MR {mr_id} has been rejected by {rejected_by}.\n\n"
            f"Reason: {reason}\n\nYou may edit and resubmit from the portal.\n\n"
            f"Log in: {PORTAL_URL}" + signature("system"))

        return response({"success":True,"status":"REJECTED"})
    except Exception as e:
        return error(str(e), 500)
