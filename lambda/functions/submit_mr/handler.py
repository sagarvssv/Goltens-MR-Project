"""
Lambda: submit_mr
Handles MR form submission, document tracking, and email notifications.
"""
import json
import sys
sys.path.insert(0, "/opt/python")
from shared_utils import *

def handler(event, context):
    try:
        body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event.get("body", {})

        mr_id         = body.get("mr_id")
        vessel        = body.get("vessel", "")
        department    = body.get("department", "")
        job_no        = body.get("job_no", "")
        date_required = body.get("date_required", "")
        purpose       = body.get("purpose", "")
        items         = body.get("items", [])
        doc_keys      = body.get("document_s3_keys", [])
        form_type     = body.get("form_type", "material_requisition")
        submitted_by_name  = body.get("submitted_by_name", "")
        submitted_by_email = body.get("submitted_by_email", "")
        submitted_by_id    = body.get("submitted_by_id_no", "")

        if not mr_id or not vessel or not submitted_by_email:
            return error("Missing required fields: mr_id, vessel, submitted_by_email")

        # Calculate total and HOD routing
        total_cost = sum(
            float(i.get("estimated_cost", 0)) * int(i.get("qty", 0))
            for i in items
        )
        needs_hod = total_cost > APPROVAL_SLAB
        itxt      = items_text(items)

        # Save to DynamoDB
        table = dynamodb.Table(MR_TABLE)
        table.put_item(Item={
            "mr_id":               mr_id,
            "vessel":              vessel,
            "department":          department,
            "job_no":              job_no,
            "date_requested":      now()[:10],
            "date_required":       date_required,
            "purpose":             purpose,
            "items":               items,
            "document_s3_keys":    doc_keys,
            "total_cost":          str(round(total_cost, 2)),
            "needs_hod_approval":  needs_hod,
            "status":              "PENDING",
            "submitted_by_name":   submitted_by_name,
            "submitted_by_email":  submitted_by_email,
            "submitted_by_id_no":  submitted_by_id,
            "form_type":           form_type,
            "created_at":          now(),
            "updated_at":          now(),
        })

        # Notify User
        send_email(
            submitted_by_email,
            f"MR Submitted Successfully — {mr_id}",
            f"Dear {submitted_by_name},\n\n"
            f"Your Material Requisition has been submitted.\n\n"
            f"MR Number : {mr_id}\n"
            f"Vessel    : {vessel}\n"
            f"Job No.   : {job_no}\n"
            f"Total     : AED {total_cost:,.2f}\n\n"
            f"Items:\n{itxt}\n\n"
            f"Your request is pending Manager approval.\n"
            f"Log in to track: {PORTAL_URL}" + signature("system")
        )

        # Notify Manager
        send_email(
            MANAGER_EMAIL,
            f"New MR Requires Your Approval — {mr_id}",
            f"A new Material Requisition has been submitted by {submitted_by_name}.\n\n"
            f"MR Number : {mr_id}\n"
            f"Vessel    : {vessel}\n"
            f"Job No.   : {job_no}\n"
            f"Total     : AED {total_cost:,.2f}\n"
            f"{'NOTE: Amount exceeds AED 5,000. HOD approval required after yours.' if needs_hod else ''}\n\n"
            f"Items:\n{itxt}\n\n"
            f"Log in to review: {PORTAL_URL}" + signature("system")
        )

        return response({"success": True, "mr_id": mr_id, "status": "PENDING"})

    except Exception as e:
        print(f"Error in submit_mr: {e}")
        return error(str(e), 500)
