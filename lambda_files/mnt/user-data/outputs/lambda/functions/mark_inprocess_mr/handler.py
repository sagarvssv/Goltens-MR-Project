"""Lambda: mark_inprocess_mr — SC marks stock unavailable"""
import json, sys
sys.path.insert(0, "/opt/python")
from shared_utils import *

def handler(event, context):
    try:
        body     = json.loads(event.get("body","{}")) if isinstance(event.get("body"),str) else event.get("body",{})
        mr_id    = body.get("mr_id")
        actioned = body.get("actioned_by","")
        note     = body.get("inprocess_note","")

        item = get_mr(mr_id)
        if not item: return error("MR not found", 404)

        itxt = items_text(item.get("items",[]))
        table = dynamodb.Table(MR_TABLE)
        table.update_item(
            Key={"mr_id": mr_id},
            UpdateExpression="SET #s=:s, inprocess_note=:n, updated_at=:ua",
            ExpressionAttributeNames={"#s":"status"},
            ExpressionAttributeValues={":s":"IN_PROCESS",":n":note,":ua":now()}
        )
        send_email(item["submitted_by_email"], f"MR In Process — Stock Pending — {mr_id}",
            f"Dear {item['submitted_by_name']},\n\nYour MR {mr_id} is in process. Some items are pending stock.\n\nNote: {note}\n\nLog in: {PORTAL_URL}" + signature("supply_chain"))
        send_email(WH_EMAIL, f"MR In Process — Awaiting Stock — {mr_id}",
            f"MR {mr_id} marked IN PROCESS by {actioned}. Items pending stock:\n\n{itxt}\n\nNote: {note}\n\nLog in: {PORTAL_URL}" + signature("supply_chain"))
        send_email(SC_MGR_EMAIL, f"MR In Process — Stock Unavailable — {mr_id}",
            f"MR {mr_id} marked IN PROCESS by {actioned} due to stock unavailability.\n\nNote: {note}\nLog in: {PORTAL_URL}" + signature("system"))

        return response({"success":True,"status":"IN_PROCESS"})
    except Exception as e:
        return error(str(e), 500)
