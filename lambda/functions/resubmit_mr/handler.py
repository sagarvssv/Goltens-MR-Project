"""Lambda: resubmit_mr — User resubmits a rejected MR"""
import json, sys
sys.path.insert(0, "/opt/python")
from shared_utils import *

def handler(event, context):
    try:
        body       = json.loads(event.get("body","{}")) if isinstance(event.get("body"),str) else event.get("body",{})
        mr_id      = body.get("mr_id")
        items      = body.get("items", [])
        doc_keys   = body.get("document_s3_keys", [])
        total_cost = sum(float(i.get("estimated_cost",0))*int(i.get("qty",0)) for i in items)
        needs_hod  = total_cost > APPROVAL_SLAB
        itxt       = items_text(items)

        item = get_mr(mr_id)
        if not item: return error("MR not found", 404)

        table = dynamodb.Table(MR_TABLE)
        table.update_item(
            Key={"mr_id": mr_id},
            UpdateExpression="SET #s=:s, vessel=:v, department=:d, job_no=:j, date_required=:dr, purpose=:p, items=:i, document_s3_keys=:dk, total_cost=:tc, needs_hod_approval=:nh, rejected_by=:rb, rejection_reason=:rr, updated_at=:ua",
            ExpressionAttributeNames={"#s":"status"},
            ExpressionAttributeValues={
                ":s":"PENDING", ":v":body.get("vessel",item.get("vessel","")),
                ":d":body.get("department",item.get("department","")),
                ":j":body.get("job_no",item.get("job_no","")),
                ":dr":body.get("date_required",item.get("date_required","")),
                ":p":body.get("purpose",item.get("purpose","")),
                ":i":items, ":dk":doc_keys, ":tc":str(round(total_cost,2)),
                ":nh":needs_hod, ":rb":"", ":rr":"", ":ua":now()
            }
        )
        send_email(item["submitted_by_email"], f"MR Resubmitted — {mr_id}",
            f"Dear {item['submitted_by_name']},\n\nYour MR {mr_id} has been resubmitted successfully.\nStatus: Pending Manager Approval\nLog in: {PORTAL_URL}" + signature("system"))
        send_email(MANAGER_EMAIL, f"MR Resubmitted — Requires Review — {mr_id}",
            f"MR {mr_id} resubmitted by {item['submitted_by_name']} after rejection.\n\nItems:\n{itxt}\nTotal: AED {total_cost:,.2f}\n\nLog in: {PORTAL_URL}" + signature("system"))
        if needs_hod:
            send_email(HOD_EMAIL, f"MR Resubmitted — FYI — {mr_id}",
                f"MR {mr_id} resubmitted. Amount AED {total_cost:,.2f} exceeds AED {APPROVAL_SLAB:,.0f} — will reach you after manager review.\nLog in: {PORTAL_URL}" + signature("system"))

        return response({"success":True,"mr_id":mr_id,"status":"PENDING"})
    except Exception as e:
        return error(str(e), 500)
