"""Lambda: warehouse_issue_mr"""
import json, sys
sys.path.insert(0, "/opt/python")
from shared_utils import *

def handler(event, context):
    try:
        body       = json.loads(event.get("body","{}")) if isinstance(event.get("body"),str) else event.get("body",{})
        mr_id      = body.get("mr_id")
        issued_by  = body.get("issued_by","")
        issued_to  = body.get("warehouse_issued_to_name","")
        issued_id  = body.get("warehouse_issued_to_id","")
        wh_note    = body.get("warehouse_issue_note","")

        item = get_mr(mr_id)
        if not item: return error("MR not found", 404)

        itxt = items_text(item.get("items",[]))
        total = item.get("total_cost","0")
        vessel = item.get("vessel","—")
        job_no = item.get("job_no","—")

        table = dynamodb.Table(MR_TABLE)
        table.update_item(
            Key={"mr_id": mr_id},
            UpdateExpression="SET #s=:s, issued_by=:ib, warehouse_issued_to_name=:itn, warehouse_issued_to_id=:iti, warehouse_issue_note=:win, issued_at=:ia, updated_at=:ua",
            ExpressionAttributeNames={"#s":"status"},
            ExpressionAttributeValues={":s":"ISSUED",":ib":issued_by,":itn":issued_to,":iti":issued_id,":win":wh_note,":ia":now(),":ua":now()}
        )

        email_body = (
            f"Job No.   : {job_no}\nVessel    : {vessel}\nMR Number : {mr_id}\n"
            f"Issued To : {issued_to}\nIssued By : {issued_by}\nTotal     : AED {total}\n\n"
            f"Items issued:\n{itxt}\n\n"
            + (f"Warehouse Note: {wh_note}\n\n" if wh_note else "")
            + f"Log in to view: {PORTAL_URL}"
        )

        for email, role, name in [
            (item["submitted_by_email"], "system",  f"Dear {item['submitted_by_name']}"),
            (MANAGER_EMAIL,             "system",   "Dear Manager"),
            (HOD_EMAIL,                 "system",   "Dear HOD"),
            (SC_EMAIL,                  "system",   "Dear Supply Chain"),
            (SC_MGR_EMAIL,              "system",   "Dear SC Manager"),
        ]:
            send_email(email, f"Items Issued — Job No: {job_no} — {mr_id}",
                f"{name},\n\nItems for MR {mr_id} have been issued by Warehouse.\n\n{email_body}" + signature("warehouse"))

        return response({"success":True,"status":"ISSUED"})
    except Exception as e:
        return error(str(e), 500)
