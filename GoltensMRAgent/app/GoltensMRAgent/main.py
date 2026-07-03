"""
GoltensMRAgent — main.py
Covers all 7 backend requirements:
  1. User profile auto-fill from goltens-users DynamoDB table
  2. Email to user + manager on MR submission (SES)
  3. All data persisted in DynamoDB (goltens-mr-forms, goltens-users, goltens-master-data)
  4. Manager "In Process" status when stock unavailable + user notification
  5. SES for all email notifications
  6. Supporting documents uploaded to S3, signed URLs returned for manager preview
  7. Email notification to user on approval / rejection
"""

import json
import uuid
import os
import boto3
import logging
from datetime import datetime, timezone
from typing import Optional
from strands import Agent, tool
from strands.agent.conversation_manager.null_conversation_manager import NullConversationManager
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from boto3.dynamodb.conditions import Key
from model.load import load_model
from mcp_client.client import get_streamable_http_mcp_client
from memory.session import get_memory_session_manager

# ─── App bootstrap ────────────────────────────────────────────────────────────
app = BedrockAgentCoreApp()
log = app.logger

# ─── AWS clients ──────────────────────────────────────────────────────────────
REGION          = os.getenv("AWS_DEFAULT_REGION", "eu-central-1")
dynamodb        = boto3.resource("dynamodb", region_name=REGION)
s3              = boto3.client("s3",          region_name=REGION)
ses             = boto3.client("ses",          region_name=REGION)
sfn             = boto3.client("stepfunctions", region_name=REGION)

# ─── Config from .env.local ───────────────────────────────────────────────────
MR_TABLE        = os.getenv("MR_TABLE",        "goltens-mr-forms")
USERS_TABLE     = os.getenv("USERS_TABLE",     "goltens-users")
MASTER_TABLE    = os.getenv("MASTER_TABLE",    "goltens-mr-master-data")
S3_BUCKET       = os.getenv("S3_BUCKET",       "goltens-mr-documents")
SES_SENDER      = os.getenv("SES_SENDER",      "mr-portal@goltens.com")
SFN_ARN         = os.getenv("SFN_ARN",         "")
PRESIGN_EXPIRY  = int(os.getenv("PRESIGN_EXPIRY", "3600"))  # 1 hour

mcp_clients = [get_streamable_http_mcp_client()]

# ─── System prompt ────────────────────────────────────────────────────────────
DEFAULT_SYSTEM_PROMPT = """
You are the Goltens Material Requisition (MR) assistant for Goltens Co. Ltd. Dubai Branch.

You help:
- Staff (users): submit MRs, check status of their submissions
- Managers: view pending MRs, approve, reject, or mark items as in-process (stock unavailable)

Always be concise and professional. When unsure of a user's identity, ask for their email.
Never invent MR numbers — always use what the tools return.
"""

tools = []

# ─── Helper: send SES email ───────────────────────────────────────────────────
def _send_email(to: str, subject: str, body: str):
    """Send a plain-text SES email. Silently logs errors rather than crashing."""
    try:
        ses.send_email(
            Source=SES_SENDER,
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": subject},
                "Body":    {"Text": {"Data": body}},
            },
        )
        log.info(f"Email sent to {to}: {subject}")
    except Exception as e:
        log.error(f"SES send failed to {to}: {e}")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL 1 — Get user profile (for auto-fill on login)
# ═══════════════════════════════════════════════════════════════════════════════
@tool
def get_user_profile(email: str) -> str:
    """
    Fetch a user's profile from DynamoDB by email address.
    Returns name, department, ID number and role so the frontend
    can auto-populate the 'Requested By' signatory block.
    """
    try:
        table = dynamodb.Table(USERS_TABLE)
        resp  = table.get_item(Key={"email": email})
        user  = resp.get("Item")
        if not user:
            return json.dumps({"error": f"No user found for email: {email}"})
        return json.dumps({
            "email":      user.get("email"),
            "name":       user.get("name"),
            "id_no":      user.get("id_no"),
            "department": user.get("department"),
            "role":       user.get("role"),
        })
    except Exception as e:
        log.error(f"get_user_profile error: {e}")
        return json.dumps({"error": str(e)})

tools.append(get_user_profile)


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL 2 — Get presigned S3 upload URL (called before form submission)
# ═══════════════════════════════════════════════════════════════════════════════
@tool
def get_upload_url(file_name: str, file_type: str, mr_id: str) -> str:
    """
    Generate a presigned S3 PUT URL so the frontend can upload
    a supporting document directly to S3 without AWS credentials.
    Returns: { upload_url, s3_key }
    """
    try:
        s3_key = f"mr-documents/{mr_id}/{uuid.uuid4().hex}_{file_name}"
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket":      S3_BUCKET,
                "Key":         s3_key,
                "ContentType": file_type,
            },
            ExpiresIn=300,  # 5 minutes to complete the upload
        )
        return json.dumps({"upload_url": url, "s3_key": s3_key})
    except Exception as e:
        log.error(f"get_upload_url error: {e}")
        return json.dumps({"error": str(e)})

tools.append(get_upload_url)


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL 3 — Submit MR
# ═══════════════════════════════════════════════════════════════════════════════
@tool
def submit_mr(
    vessel:               str,
    job_no:               str,
    date_required:        str,
    submitted_by_name:    str,
    submitted_by_email:   str,
    submitted_by_id_no:   str,
    manager_email:        str,
    items:                str,   # JSON array: [{item_code, description, qty, uom, activity_code, estimated_cost, budgeted}]
    document_s3_keys:     str = "[]",  # JSON array of S3 keys already uploaded
) -> str:
    """
    Persist a new Material Requisition to DynamoDB, trigger the Step Functions
    approval workflow, and send confirmation emails to the submitter and manager.
    Returns the generated MR number.
    """
    try:
        mr_id     = f"MR-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        item_list = json.loads(items)
        doc_keys  = json.loads(document_s3_keys)
        total_cost = sum(
            (float(i.get("estimated_cost", 0)) * int(i.get("qty", 0)))
            for i in item_list
        )

        # ── Persist to DynamoDB ──
        table = dynamodb.Table(MR_TABLE)
        table.put_item(Item={
            "mr_id":              mr_id,
            "vessel":             vessel,
            "job_no":             job_no,
            "date_requested":     _now()[:10],
            "date_required":      date_required,
            "submitted_by_name":  submitted_by_name,
            "submitted_by_email": submitted_by_email,
            "submitted_by_id_no": submitted_by_id_no,
            "manager_email":      manager_email,
            "items":              item_list,
            "document_s3_keys":   doc_keys,
            "total_cost":         str(round(total_cost, 2)),
            "status":             "PENDING",
            "created_at":         _now(),
            "updated_at":         _now(),
        })

        # ── Trigger Step Functions ──
        if SFN_ARN:
            try:
                sfn.start_execution(
                    stateMachineArn=SFN_ARN,
                    name=f"{mr_id}-{int(datetime.now().timestamp())}",
                    input=json.dumps({
                        "mr_id":              mr_id,
                        "manager_email":      manager_email,
                        "submitted_by_email": submitted_by_email,
                        "total_cost":         total_cost,
                    }),
                )
            except Exception as sfn_err:
                log.warning(f"Step Functions trigger failed (non-fatal): {sfn_err}")

        # ── Email: submitter confirmation ──
        _send_email(
            to=submitted_by_email,
            subject=f"MR Submitted — {mr_id}",
            body=(
                f"Dear {submitted_by_name},\n\n"
                f"Your Material Requisition has been submitted successfully.\n\n"
                f"MR Number      : {mr_id}\n"
                f"Vessel         : {vessel}\n"
                f"Job No.        : {job_no}\n"
                f"Date Required  : {date_required}\n"
                f"Total Est. Cost: AED {total_cost:,.2f}\n"
                f"Status         : PENDING APPROVAL\n\n"
                f"You will be notified once the manager reviews your request.\n\n"
                f"Goltens MR Portal\nGoltens Co. Ltd. Dubai Branch"
            ),
        )

        # ── Email: manager notification ──
        _send_email(
            to=manager_email,
            subject=f"New MR Pending Approval — {mr_id}",
            body=(
                f"A new Material Requisition has been submitted and requires your approval.\n\n"
                f"MR Number      : {mr_id}\n"
                f"Submitted By   : {submitted_by_name} ({submitted_by_email})\n"
                f"Vessel         : {vessel}\n"
                f"Job No.        : {job_no}\n"
                f"Date Required  : {date_required}\n"
                f"Total Est. Cost: AED {total_cost:,.2f}\n"
                f"Items          : {len(item_list)}\n\n"
                f"Please log in to the Goltens MR Portal to review and action this request.\n\n"
                f"Goltens Co. Ltd. Dubai Branch"
            ),
        )

        return json.dumps({
            "success":    True,
            "mr_id":      mr_id,
            "total_cost": round(total_cost, 2),
            "status":     "PENDING",
            "message":    f"MR {mr_id} submitted. Confirmation sent to {submitted_by_email}. Manager notified at {manager_email}.",
        })

    except Exception as e:
        log.error(f"submit_mr error: {e}")
        return json.dumps({"success": False, "error": str(e)})

tools.append(submit_mr)


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL 4 — Get MR status
# ═══════════════════════════════════════════════════════════════════════════════
@tool
def get_mr_status(mr_id: str) -> str:
    """Retrieve current status and full details of an MR by its MR number."""
    try:
        table = dynamodb.Table(MR_TABLE)
        resp  = table.get_item(Key={"mr_id": mr_id})
        item  = resp.get("Item")
        if not item:
            return json.dumps({"error": f"No MR found: {mr_id}"})
        return json.dumps(item, default=str)
    except Exception as e:
        return json.dumps({"error": str(e)})

tools.append(get_mr_status)


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL 5 — List MRs (for manager queue)
# ═══════════════════════════════════════════════════════════════════════════════
@tool
def list_mrs(status_filter: str = "ALL") -> str:
    """
    Return all MRs, optionally filtered by status.
    status_filter: ALL | PENDING | APPROVED | REJECTED | IN_PROCESS
    Used to populate the manager portal queue.
    """
    try:
        table  = dynamodb.Table(MR_TABLE)
        result = table.scan()
        items  = result.get("Items", [])
        if status_filter != "ALL":
            items = [i for i in items if i.get("status") == status_filter]
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return json.dumps(items, default=str)
    except Exception as e:
        return json.dumps({"error": str(e)})

tools.append(list_mrs)


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL 6 — Get S3 presigned download URLs (for manager to view documents)
# ═══════════════════════════════════════════════════════════════════════════════
@tool
def get_document_urls(mr_id: str) -> str:
    """
    Return presigned S3 GET URLs for all documents attached to an MR.
    URLs expire after 1 hour. Manager uses these to view/download files.
    """
    try:
        table = dynamodb.Table(MR_TABLE)
        resp  = table.get_item(Key={"mr_id": mr_id})
        item  = resp.get("Item")
        if not item:
            return json.dumps({"error": f"MR not found: {mr_id}"})

        doc_keys = item.get("document_s3_keys", [])
        if not doc_keys:
            return json.dumps({"documents": [], "message": "No documents attached to this MR."})

        documents = []
        for key in doc_keys:
            try:
                url = s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": S3_BUCKET, "Key": key},
                    ExpiresIn=PRESIGN_EXPIRY,
                )
                file_name = key.split("/")[-1]
                # Strip uuid prefix (format: {uuid}_{filename})
                if "_" in file_name:
                    file_name = "_".join(file_name.split("_")[1:])
                documents.append({
                    "s3_key":   key,
                    "file_name": file_name,
                    "url":       url,
                })
            except Exception as key_err:
                log.warning(f"Could not presign key {key}: {key_err}")

        return json.dumps({"documents": documents})
    except Exception as e:
        return json.dumps({"error": str(e)})

tools.append(get_document_urls)


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL 7 — Approve MR
# ═══════════════════════════════════════════════════════════════════════════════
@tool
def approve_mr(mr_id: str, approved_by: str, comments: str = "") -> str:
    """
    Approve a PENDING MR. Updates DynamoDB status to APPROVED and
    sends a notification email to the submitter.
    """
    try:
        table = dynamodb.Table(MR_TABLE)
        resp  = table.get_item(Key={"mr_id": mr_id})
        item  = resp.get("Item")
        if not item:
            return json.dumps({"error": f"MR not found: {mr_id}"})
        if item["status"] not in ("PENDING",):
            return json.dumps({"error": f"MR {mr_id} is already {item['status']} — cannot approve."})

        table.update_item(
            Key={"mr_id": mr_id},
            UpdateExpression=(
                "SET #s = :s, approved_by = :ab, "
                "approval_comments = :ac, updated_at = :ua"
            ),
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":s":  "APPROVED",
                ":ab": approved_by,
                ":ac": comments,
                ":ua": _now(),
            },
        )

        _send_email(
            to=item["submitted_by_email"],
            subject=f"MR Approved — {mr_id}",
            body=(
                f"Dear {item['submitted_by_name']},\n\n"
                f"Your Material Requisition has been APPROVED.\n\n"
                f"MR Number   : {mr_id}\n"
                f"Vessel      : {item['vessel']}\n"
                f"Job No.     : {item['job_no']}\n"
                f"Approved By : {approved_by}\n"
                f"Comments    : {comments or 'None'}\n\n"
                f"Please proceed with procurement as per Goltens policy.\n\n"
                f"Goltens Co. Ltd. Dubai Branch"
            ),
        )

        return json.dumps({
            "success": True,
            "mr_id":   mr_id,
            "status":  "APPROVED",
            "message": f"MR {mr_id} approved. Submitter notified at {item['submitted_by_email']}.",
        })
    except Exception as e:
        log.error(f"approve_mr error: {e}")
        return json.dumps({"success": False, "error": str(e)})

tools.append(approve_mr)


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL 8 — Reject MR
# ═══════════════════════════════════════════════════════════════════════════════
@tool
def reject_mr(mr_id: str, rejected_by: str, reason: str) -> str:
    """
    Reject a PENDING MR with a mandatory reason.
    Updates DynamoDB status to REJECTED and notifies the submitter by email.
    """
    try:
        if not reason.strip():
            return json.dumps({"error": "Rejection reason is mandatory."})

        table = dynamodb.Table(MR_TABLE)
        resp  = table.get_item(Key={"mr_id": mr_id})
        item  = resp.get("Item")
        if not item:
            return json.dumps({"error": f"MR not found: {mr_id}"})
        if item["status"] not in ("PENDING",):
            return json.dumps({"error": f"MR {mr_id} is already {item['status']}."})

        table.update_item(
            Key={"mr_id": mr_id},
            UpdateExpression=(
                "SET #s = :s, rejected_by = :rb, "
                "rejection_reason = :rr, updated_at = :ua"
            ),
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":s":  "REJECTED",
                ":rb": rejected_by,
                ":rr": reason,
                ":ua": _now(),
            },
        )

        _send_email(
            to=item["submitted_by_email"],
            subject=f"MR Rejected — {mr_id}",
            body=(
                f"Dear {item['submitted_by_name']},\n\n"
                f"Your Material Requisition has been REJECTED.\n\n"
                f"MR Number    : {mr_id}\n"
                f"Vessel       : {item['vessel']}\n"
                f"Job No.      : {item['job_no']}\n"
                f"Rejected By  : {rejected_by}\n"
                f"Reason       : {reason}\n\n"
                f"Please revise your request and resubmit if needed.\n"
                f"Contact {rejected_by} for further clarification.\n\n"
                f"Goltens Co. Ltd. Dubai Branch"
            ),
        )

        return json.dumps({
            "success": True,
            "mr_id":   mr_id,
            "status":  "REJECTED",
            "message": f"MR {mr_id} rejected. Submitter notified at {item['submitted_by_email']}.",
        })
    except Exception as e:
        log.error(f"reject_mr error: {e}")
        return json.dumps({"success": False, "error": str(e)})

tools.append(reject_mr)


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL 9 — Mark MR as In Process (stock unavailable)
# ═══════════════════════════════════════════════════════════════════════════════
@tool
def mark_inprocess_mr(
    mr_id: str,
    actioned_by: str,
    note: str = "Items will be issued once stock is available.",
) -> str:
    """
    Mark an MR as IN_PROCESS when stock is currently unavailable.
    Updates DynamoDB status to IN_PROCESS and notifies the submitter that
    their items will be issued once stock arrives.
    Status flow: PENDING → IN_PROCESS → APPROVED (when stock arrives)
    """
    try:
        table = dynamodb.Table(MR_TABLE)
        resp  = table.get_item(Key={"mr_id": mr_id})
        item  = resp.get("Item")
        if not item:
            return json.dumps({"error": f"MR not found: {mr_id}"})
        if item["status"] not in ("PENDING",):
            return json.dumps({"error": f"MR {mr_id} is {item['status']} — can only mark PENDING MRs as in-process."})

        table.update_item(
            Key={"mr_id": mr_id},
            UpdateExpression=(
                "SET #s = :s, inprocess_by = :ib, "
                "inprocess_note = :in, updated_at = :ua"
            ),
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":s":  "IN_PROCESS",
                ":ib": actioned_by,
                ":in": note,
                ":ua": _now(),
            },
        )

        _send_email(
            to=item["submitted_by_email"],
            subject=f"MR In Process — {mr_id}",
            body=(
                f"Dear {item['submitted_by_name']},\n\n"
                f"Your Material Requisition is currently IN PROCESS.\n\n"
                f"MR Number   : {mr_id}\n"
                f"Vessel      : {item['vessel']}\n"
                f"Job No.     : {item['job_no']}\n"
                f"Actioned By : {actioned_by}\n"
                f"Note        : {note}\n\n"
                f"The requested items are not currently in stock. They will be "
                f"issued to you as soon as stock becomes available. No further "
                f"action is required from you at this time.\n\n"
                f"You will receive another notification when your items are ready.\n\n"
                f"Goltens Co. Ltd. Dubai Branch"
            ),
        )

        return json.dumps({
            "success": True,
            "mr_id":   mr_id,
            "status":  "IN_PROCESS",
            "message": f"MR {mr_id} marked IN_PROCESS. Submitter notified at {item['submitted_by_email']}.",
        })
    except Exception as e:
        log.error(f"mark_inprocess_mr error: {e}")
        return json.dumps({"success": False, "error": str(e)})

tools.append(mark_inprocess_mr)


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL 10 — Get master data (vessels, job numbers for dropdowns)
# ═══════════════════════════════════════════════════════════════════════════════
@tool
def get_master_data(data_type: str) -> str:
    """
    Fetch dropdown values from goltens-master-data.
    data_type: 'vessels' | 'job_numbers' | 'departments'
    """
    try:
        table = dynamodb.Table(MASTER_TABLE)
        resp  = table.query(
            KeyConditionExpression=Key("data_type").eq(data_type)
        )
        values = [i["value"] for i in resp.get("Items", [])]
        if not values:
            return json.dumps({"error": f"No data found for type: {data_type}"})
        return json.dumps({data_type: values})
    except Exception as e:
        return json.dumps({"error": str(e)})

tools.append(get_master_data)


# ─── Add MCP clients ──────────────────────────────────────────────────────────
for mcp_client in mcp_clients:
    if mcp_client:
        tools.append(mcp_client)


# ─── Agent factory ────────────────────────────────────────────────────────────
def _make_conversation_manager():
    return NullConversationManager()


def agent_factory():
    cache = {}
    def get_or_create_agent(session_id, user_id):
        key = f"{session_id}/{user_id}"
        if key not in cache:
            cache[key] = Agent(
                model=load_model(),
                session_manager=get_memory_session_manager(session_id, user_id),
                conversation_manager=_make_conversation_manager(),
                system_prompt=DEFAULT_SYSTEM_PROMPT,
                tools=tools,
                hooks=[],
            )
        return cache[key]
    return get_or_create_agent

get_or_create_agent = agent_factory()


# ─── Payload extractor ────────────────────────────────────────────────────────
def _extract_prompt(payload: dict):
    if "messages" in payload:
        return payload["messages"]
    if "tool_results" in payload:
        return [{"role": "user", "content": [{"toolResult": {
            "toolUseId": tr["toolUseId"],
            "status":    tr.get("status", "success"),
            "content":   tr.get("content", []),
        }} for tr in payload["tool_results"]]}]
    return payload.get("prompt", "")


# ─── Entrypoint ───────────────────────────────────────────────────────────────
@app.entrypoint
async def invoke(payload, context):
    log.info("GoltensMRAgent invoked")
    session_id = getattr(context, "session_id", "default-session")
    user_id    = getattr(context, "user_id",    "default-user")
    agent      = get_or_create_agent(session_id, user_id)
    prompt     = _extract_prompt(payload)

    async for event in agent.stream_async(prompt):
        if not isinstance(event, dict) or "event" not in event:
            continue
        cbs = event["event"].get("contentBlockStart")
        if cbs is not None and not cbs.get("start"):
            continue
        yield event


if __name__ == "__main__":
    app.run()
