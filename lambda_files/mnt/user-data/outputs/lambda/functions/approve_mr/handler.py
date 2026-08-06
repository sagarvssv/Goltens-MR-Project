"""Lambda: approve_mr — Manager approval with auto-routing to HOD if above slab"""
import json, sys
sys.path.insert(0, "/opt/python")
from shared_utils import *

def handler(event, context):
    try:
        body        = json.loads(event.get("body","{}")) if isinstance(event.get("body"),str) else event.get("body",{})
        mr_id       = body.get("mr_id")
        approved_by = body.get("approved_by","")
        approver_id = body.get("approver_id","M-01")
        comments    = body.get("comments","")

        item = get_mr(mr_id)
        if not item: return error("MR not found", 404)

        itxt       = items_text(item.get("items",[]))
        total_cost = float(item.get("total_cost",0))
        table      = dynamodb.Table(MR_TABLE)

        # Auto-route to HOD if above slab
        if item.get("needs_hod_approval") and item["status"] == "PENDING":
            table.update_item(
                Key={"mr_id": mr_id},
                UpdateExpression="SET #s=:s, approved_by=:ab, manager_id=:mid, manager_approved_at=:ma, updated_at=:ua",
                ExpressionAttributeNames={"#s":"status"},
                ExpressionAttributeValues={":s":"PENDING_HOD",":ab":approved_by,":mid":approver_id,":ma":now(),":ua":now()}
            )
            # Notify User
            send_email(item["submitted_by_email"], f"MR Forwarded to HOD — {mr_id}",
                f"Dear {item['submitted_by_name']},\n\nYour MR {mr_id} has been approved by Manager {approved_by} "
                f"and forwarded to HOD/GM for final approval (amount AED {total_cost:,.2f} exceeds AED {APPROVAL_SLAB:,.0f}).\n\n"
                f"Log in to track: {PORTAL_URL}" + signature("manager"))
            # Notify HOD
            send_email(HOD_EMAIL, f"MR Requires HOD Approval — {mr_id}",
                f"MR {mr_id} submitted by {item['submitted_by_name']} has been approved by Manager {approved_by} "
                f"and requires your final approval.\n\nTotal: AED {total_cost:,.2f}\nItems:\n{itxt}\n\n"
                f"Log in to review: {PORTAL_URL}" + signature("manager"))
            return response({"success":True,"status":"PENDING_HOD"})

        # Direct approval below slab
        table.update_item(
            Key={"mr_id": mr_id},
            UpdateExpression="SET #s=:s, approved_by=:ab, manager_id=:mid, approval_comments=:ac, updated_at=:ua",
            ExpressionAttributeNames={"#s":"status"},
            ExpressionAttributeValues={":s":"APPROVED",":ab":approved_by,":mid":approver_id,":ac":comments,":ua":now()}
        )
        # Notify User
        send_email(item["submitted_by_email"], f"MR Approved — {mr_id}",
            f"Dear {item['submitted_by_name']},\n\nYour MR {mr_id} has been approved by {approved_by}.\n\n"
            f"Total: AED {total_cost:,.2f}\n\nLog in to track: {PORTAL_URL}" + signature("manager"))
        # Notify SC
        send_email(SC_EMAIL, f"MR Assigned to You — {mr_id}",
            f"MR {mr_id} approved by {approved_by}. Please process.\n\nItems:\n{itxt}\n\n"
            f"Log in: {PORTAL_URL}" + signature("manager"))
        # Notify SC Manager
        send_email(SC_MGR_EMAIL, f"MR Approved & Assigned to SC — {mr_id}",
            f"MR {mr_id} approved by Manager {approved_by} and assigned to Supply Chain.\n\n"
            f"Total: AED {total_cost:,.2f}\nLog in: {PORTAL_URL}" + signature("system"))

        return response({"success":True,"status":"APPROVED"})
    except Exception as e:
        return error(str(e), 500)
