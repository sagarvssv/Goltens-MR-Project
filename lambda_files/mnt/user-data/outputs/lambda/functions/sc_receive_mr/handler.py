"""Lambda: sc_receive_mr"""
import json, sys
sys.path.insert(0, "/opt/python")
from shared_utils import *

def handler(event, context):
    try:
        body       = json.loads(event.get("body","{}")) if isinstance(event.get("body"),str) else event.get("body",{})
        mr_id      = body.get("mr_id")
        sc_name    = body.get("sc_name","")
        sc_id      = body.get("sc_id","")
        wh_comment = body.get("warehouse_collection_comment","")

        item = get_mr(mr_id)
        if not item: return error("MR not found", 404)

        itxt = items_text(item.get("items",[]))
        table = dynamodb.Table(MR_TABLE)
        table.update_item(
            Key={"mr_id": mr_id},
            UpdateExpression="SET #s=:s, sc_received_by_name=:sn, sc_received_by_id=:si, warehouse_collection_comment=:wc, sc_received_at=:sa, updated_at=:ua",
            ExpressionAttributeNames={"#s":"status"},
            ExpressionAttributeValues={":s":"IN_PROCESS",":sn":sc_name,":si":sc_id,":wc":wh_comment,":sa":now(),":ua":now()}
        )
        # Notify User
        send_email(item["submitted_by_email"], f"MR Received by Supply Chain — {mr_id}",
            f"Dear {item['submitted_by_name']},\n\nYour MR {mr_id} has been received by Supply Chain ({sc_name}) and is being processed.\n\n"
            f"Log in: {PORTAL_URL}" + signature("supply_chain"))
        # Notify Warehouse
        send_email(WH_EMAIL, f"Items Ready for Issuance — {mr_id}",
            f"MR {mr_id} processed by Supply Chain ({sc_name}). Items ready for issuance:\n\n{itxt}\n\n"
            f"Log in to confirm issuance: {PORTAL_URL}" + signature("supply_chain"))
        # Notify SC Manager
        send_email(SC_MGR_EMAIL, f"MR Received by SC — {mr_id}",
            f"MR {mr_id} received and processed by {sc_name}.\nLog in: {PORTAL_URL}" + signature("system"))

        return response({"success":True})
    except Exception as e:
        return error(str(e), 500)
