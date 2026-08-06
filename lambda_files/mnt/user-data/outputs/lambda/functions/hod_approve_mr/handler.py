"""Lambda: hod_approve_mr — HOD final approval"""
import json, sys
sys.path.insert(0, "/opt/python")
from shared_utils import *

def handler(event, context):
    try:
        body        = json.loads(event.get("body","{}")) if isinstance(event.get("body"),str) else event.get("body",{})
        mr_id       = body.get("mr_id")
        approved_by = body.get("approved_by","")
        approver_id = body.get("approver_id","H-01")
        comments    = body.get("comments","")

        item = get_mr(mr_id)
        if not item: return error("MR not found", 404)

        itxt = items_text(item.get("items",[]))
        table = dynamodb.Table(MR_TABLE)
        table.update_item(
            Key={"mr_id": mr_id},
            UpdateExpression="SET #s=:s, hod_approved_by=:ab, hod_id=:hid, hod_comments=:ac, updated_at=:ua",
            ExpressionAttributeNames={"#s":"status"},
            ExpressionAttributeValues={":s":"APPROVED",":ab":approved_by,":hid":approver_id,":ac":comments,":ua":now()}
        )
        total = float(item.get("total_cost",0))
        # Notify User
        send_email(item["submitted_by_email"], f"MR HOD Approved — {mr_id}",
            f"Dear {item['submitted_by_name']},\n\nYour MR {mr_id} has been approved by HOD {approved_by}.\n\n"
            f"Total: AED {total:,.2f}\nLog in: {PORTAL_URL}" + signature("hod"))
        # Notify SC
        send_email(SC_EMAIL, f"MR Assigned to You — {mr_id}",
            f"MR {mr_id} HOD-approved by {approved_by}. Please process.\n\nItems:\n{itxt}\n\nLog in: {PORTAL_URL}" + signature("hod"))
        # Notify SC Manager
        send_email(SC_MGR_EMAIL, f"MR HOD-Approved & Assigned to SC — {mr_id}",
            f"MR {mr_id} approved by HOD {approved_by}. Total: AED {total:,.2f}\nLog in: {PORTAL_URL}" + signature("system"))

        return response({"success":True,"status":"APPROVED"})
    except Exception as e:
        return error(str(e), 500)
