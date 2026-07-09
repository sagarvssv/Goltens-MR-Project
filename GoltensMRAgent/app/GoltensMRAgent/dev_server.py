"""
dev_server.py — Goltens MR Portal local dev server
"""
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import boto3, uuid, os, base64
from datetime import datetime, timezone

load_dotenv(dotenv_path="../../agentcore/.env.local")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

REGION        = os.getenv("AWS_DEFAULT_REGION", "eu-central-1")
dynamodb      = boto3.resource("dynamodb", region_name=REGION)
s3            = boto3.client("s3",  region_name=REGION)
ses           = boto3.client("ses", region_name=REGION)

MR_TABLE      = os.getenv("MR_TABLE",    "goltens-mr-forms")
USERS_TABLE   = os.getenv("USERS_TABLE", "goltens-users")
S3_BUCKET     = os.getenv("S3_BUCKET",   "goltens-mr-documents")
SES_SENDER    = os.getenv("SES_SENDER",  "shashikanth.k@vcloudmaster.com")

MANAGER_EMAIL = "pramod.r@goltens.com"
HOD_EMAIL     = "gineesh.kg@goltens.com"
SC_EMAIL      = "nithya.prabhakar@goltens.com"
WH_EMAIL      = "john.pepset@goltens.com"
SC_MGR_EMAIL  = "girish.malhotra@goltens.com"
APPROVAL_SLAB = 5000
PORTAL_URL    = "http://localhost:5173"

SC_TEAM  = [SC_EMAIL]
_sc_idx  = {"i": 0}

def assign_sc():
    email = SC_TEAM[_sc_idx["i"] % len(SC_TEAM)]
    _sc_idx["i"] += 1
    return email

def now():
    return datetime.now(timezone.utc).isoformat()

def items_text(item_list):
    return "\n".join([
        f"  {i+1}. {it.get('description','')} — Qty: {it.get('qty','')} {it.get('uom','')}"
        for i, it in enumerate(item_list)
    ]) or "  (no items)"

def send_email(to, subject, body):
    try:
        ses.send_email(
            Source=SES_SENDER,
            Destination={"ToAddresses": [to]},
            Message={"Subject": {"Data": subject}, "Body": {"Text": {"Data": body}}}
        )
        print(f"Email → {to}: {subject}")
    except Exception as e:
        print(f"SES error to {to}: {e}")


def signature(role):
    """Return email signature line for each role."""
    sigs = {
        "manager":      "Pramod Raveendran\nManager, Goltens Co. Ltd. Dubai Branch",
        "hod":          "Gineesh K Gireesan\nGM / HOD, Goltens Co. Ltd. Dubai Branch",
        "supply_chain": "Nithya Prabhakar\nSupply Chain, Goltens Co. Ltd. Dubai Branch",
        "warehouse":    "John Pepset\nWarehouse, Goltens Co. Ltd. Dubai Branch",
        "system":       "Goltens MR Portal\nGoltens Co. Ltd. Dubai Branch",
    }
    return "\n\nBest regards,\n" + sigs.get(role, sigs["system"])


SC_TEAM_LIST = [
    {"name": "Nithya Prabhakar",  "email": "nithya.prabhakar@goltens.com"},
    {"name": "Supply Chain 1",    "email": "sc1@goltens.com"},
    {"name": "Supply Chain 2",    "email": "sc2@goltens.com"},
    {"name": "Supply Chain 3",    "email": "sc3@goltens.com"},
    {"name": "Supply Chain 4",    "email": "sc4@goltens.com"},
]

@app.post("/invoke")
async def invoke(req: Request):
    try:
        body   = await req.json()
        action = body.get("action")
        data   = body.get("data", {})
        print(f"Action: {action} | Keys: {list(data.keys())}")

        # ── Reserve MR ID ─────────────────────────────────────────────────────
        if action == "reserve_mr_id":
            mr_id = f"MR-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
            print(f"Reserved: {mr_id}")
            return {"mr_id": mr_id}

        # ── Get user profile ──────────────────────────────────────────────────
        elif action == "get_user_profile":
            table = dynamodb.Table(USERS_TABLE)
            resp  = table.get_item(Key={"email": data["email"]})
            return resp.get("Item") or {"error": "User not found"}

        # ── Submit MR ─────────────────────────────────────────────────────────
        elif action == "submit_mr":
            mr_id      = data.get("mr_id") or f"MR-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
            item_list  = data.get("items", [])
            doc_keys   = data.get("document_s3_keys", [])
            total_cost = sum(float(i.get("estimated_cost", 0)) * int(i.get("qty", 0)) for i in item_list)
            needs_hod  = total_cost > APPROVAL_SLAB
            sc_person  = assign_sc()

            dynamodb.Table(MR_TABLE).put_item(Item={
                "mr_id":              mr_id,
                "vessel":             data["vessel"],
                "department":         data.get("department", ""),
                "job_no":             data["job_no"],
                "date_requested":     now()[:10],
                "date_required":      data["date_required"],
                "submitted_by_name":  data["submitted_by_name"],
                "submitted_by_email": data["submitted_by_email"],
                "submitted_by_id_no": data.get("submitted_by_id_no", ""),
                "manager_email":      data.get("manager_email", MANAGER_EMAIL),
                "hod_email":          data.get("hod_email", HOD_EMAIL),
                "assigned_to":        sc_person,
                "items":              item_list,
                "document_s3_keys":   doc_keys,
                "total_cost":         str(round(total_cost, 2)),
                "status":             "PENDING",
                "needs_hod_approval": needs_hod,
                "purpose":            data.get("purpose", ""),
                "form_type":          data.get("form_type", "material_requisition"),
                "created_at":         now(),
                "updated_at":         now(),
            })

            # Email to submitter
            send_email(
                data["submitted_by_email"],
                f"MR Submitted — {mr_id}",
                f"Dear {data['submitted_by_name']},\n\n"
                f"Your MR {mr_id} has been submitted successfully.\n\n"
                f"Items:\n{items_text(item_list)}\n\n"
                f"Total  : AED {total_cost:,.2f}\n"
                f"Status : Pending Manager Approval\n"
                f"{'NOTE: This MR exceeds AED ' + str(APPROVAL_SLAB) + ' and will require Manager + HOD two-level approval.' if needs_hod else ''}\n\n"
                f"Log in to track:\n{PORTAL_URL}" + signature("system")
            )

            # Email to manager
            send_email(
                data.get("manager_email", MANAGER_EMAIL),
                f"New MR Pending Your Approval — {mr_id}",
                f"A new MR has been submitted by {data['submitted_by_name']} and requires your approval.\n\n"
                f"MR Number  : {mr_id}\n"
                f"Vessel     : {data['vessel']}\n"
                f"Job No.    : {data['job_no']}\n"
                f"Department : {data.get('department', '—')}\n"
                f"Total      : AED {total_cost:,.2f}\n\n"
                f"Items:\n{items_text(item_list)}\n\n"
                f"{'⚠ NOTE: Amount exceeds AED ' + str(APPROVAL_SLAB) + '. After your approval it will automatically go to HOD for second-level approval.' if needs_hod else ''}\n\n"
                f"Log in to review:\n{PORTAL_URL}" + signature("system")
            )

            return {"success": True, "mr_id": mr_id, "total_cost": round(total_cost, 2), "status": "PENDING", "needs_hod": needs_hod}

        # ── List MRs ──────────────────────────────────────────────────────────
        elif action == "list_mrs":
            table  = dynamodb.Table(MR_TABLE)
            items  = table.scan().get("Items", [])
            status = data.get("status_filter", "ALL")
            if status != "ALL":
                items = [i for i in items if i.get("status") == status]
            return sorted(items, key=lambda x: x.get("created_at", ""), reverse=True)

        # ── Get document URLs ─────────────────────────────────────────────────
        elif action == "get_document_urls":
            table = dynamodb.Table(MR_TABLE)
            item  = table.get_item(Key={"mr_id": data["mr_id"]}).get("Item", {})
            keys  = item.get("document_s3_keys", [])
            print(f"doc keys for {data['mr_id']}: {keys}")
            docs  = []
            for key in keys:
                try:
                    url      = s3.generate_presigned_url("get_object",
                        Params={"Bucket": S3_BUCKET, "Key": key}, ExpiresIn=3600)
                    raw_name = key.split("/")[-1]
                    parts    = raw_name.split("_", 1)
                    name     = parts[1] if len(parts) > 1 else raw_name
                    docs.append({"s3_key": key, "file_name": name, "url": url})
                    print(f"Presigned URL OK: {name}")
                except Exception as e:
                    print(f"URL failed for {key}: {e}")
            return {"documents": docs}

        # ── Get upload URL ────────────────────────────────────────────────────
        elif action == "get_upload_url":
            key = f"mr-documents/{data['mr_id']}/{uuid.uuid4().hex}_{data['file_name']}"
            print(f"Upload key: {key}")
            return {"upload_url": None, "s3_key": key}

        # ── Upload document via base64 ────────────────────────────────────────
        elif action == "upload_document":
            key     = data["s3_key"]
            content = base64.b64decode(data["content"])
            s3.put_object(Bucket=S3_BUCKET, Key=key, Body=content, ContentType=data["file_type"])
            print(f"Uploaded to S3: {key}")
            return {"success": True, "s3_key": key}

        # ── Delete document ───────────────────────────────────────────────────
        elif action == "delete_document":
            key   = data["s3_key"]
            mr_id = data["mr_id"]
            try:
                s3.delete_object(Bucket=S3_BUCKET, Key=key)
                print(f"Deleted from S3: {key}")
            except Exception as e:
                print(f"S3 delete error: {e}")
            table = dynamodb.Table(MR_TABLE)
            item  = table.get_item(Key={"mr_id": mr_id}).get("Item", {})
            keys  = [k for k in item.get("document_s3_keys", []) if k != key]
            table.update_item(
                Key={"mr_id": mr_id},
                UpdateExpression="SET document_s3_keys = :k, updated_at = :ua",
                ExpressionAttributeValues={":k": keys, ":ua": now()})
            return {"success": True}

        # ── Approve MR (Manager) — auto-routes to HOD if above slab ──────────
        elif action == "approve_mr":
            table = dynamodb.Table(MR_TABLE)
            item  = table.get_item(Key={"mr_id": data["mr_id"]}).get("Item")
            if not item: return {"error": "MR not found"}
            print(f"approve_mr: approved_by={data.get('approved_by')}, approver_id={data.get('approver_id')}")

            itxt = items_text(item.get("items", []))

            # Auto-route to HOD if above slab
            if item.get("needs_hod_approval") and item["status"] == "PENDING":
                table.update_item(
                    Key={"mr_id": data["mr_id"]},
                    UpdateExpression="SET #s=:s, approved_by=:ab, manager_id=:mid, manager_approved_at=:ma, updated_at=:ua",
                    ExpressionAttributeNames={"#s": "status"},
                    ExpressionAttributeValues={
                        ":s":  "PENDING_HOD",
                        ":ab": data["approved_by"],
                        ":mid": data.get("approver_id", "M-01"),
                        ":ma": now(),
                        ":ua": now()
                    })

                # Notify submitter
                send_email(
                    item["submitted_by_email"],
                    f"MR Under HOD Review — {data['mr_id']}",
                    f"Dear {item['submitted_by_name']},\n\n"
                    f"Your MR {data['mr_id']} has been approved by Manager {data['approved_by']} "
                    f"and has been automatically forwarded to the GM/HOD for second-level approval "
                    f"(amount exceeds AED {APPROVAL_SLAB:,.0f}).\n\n"
                    f"Items:\n{itxt}\n\n"
                    f"Log in to track:\n{PORTAL_URL}" + signature("manager")
                )

                # Notify HOD
                send_email(
                    item.get("hod_email", HOD_EMAIL),
                    f"MR Requires Your Approval — {data['mr_id']}",
                    f"Dear GM/HOD,\n\n"
                    f"MR {data['mr_id']} has been approved by Manager {data['approved_by']} "
                    f"and requires your second-level approval.\n\n"
                    f"Submitted by : {item['submitted_by_name']}\n"
                    f"Vessel       : {item.get('vessel', '—')}\n"
                    f"Job No.      : {item.get('job_no', '—')}\n"
                    f"Total        : AED {item['total_cost']}\n\n"
                    f"Items:\n{itxt}\n\n"
                    f"Log in to review:\n{PORTAL_URL}" + signature("manager")
                )

                return {"success": True, "status": "PENDING_HOD", "message": "Manager approved — automatically forwarded to HOD."}

            # Direct approval (below slab)
            table.update_item(
                Key={"mr_id": data["mr_id"]},
                UpdateExpression="SET #s=:s, approved_by=:ab, manager_id=:mid, approval_comments=:ac, updated_at=:ua",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":s":  "APPROVED",
                    ":ab": data["approved_by"],
                    ":mid": data.get("approver_id", "M-01"),
                    ":ac": data.get("comments", ""),
                    ":ua": now()
                })

            # Notify submitter
            send_email(
                item["submitted_by_email"],
                f"MR Approved — {data['mr_id']}",
                f"Dear {item['submitted_by_name']},\n\n"
                f"Your MR {data['mr_id']} has been APPROVED by {data['approved_by']}.\n"
                f"Comments: {data.get('comments', 'None')}\n\n"
                f"Items approved:\n{itxt}\n\n"
                f"Log in to view:\n{PORTAL_URL}" + signature("manager")
            )

            # Notify supply chain
            send_email(
                item.get("assigned_to", SC_EMAIL),
                f"MR Assigned to You — {data['mr_id']}",
                f"Dear Supply Chain Team,\n\n"
                f"MR {data['mr_id']} has been approved and assigned to you for processing.\n\n"
                f"Submitted by : {item['submitted_by_name']}\n"
                f"Vessel       : {item.get('vessel', '—')}\n"
                f"Job No.      : {item.get('job_no', '—')}\n"
                f"Total        : AED {item['total_cost']}\n\n"
                f"Items to process:\n{itxt}\n\n"
                f"Log in to Supply Chain portal:\n{PORTAL_URL}" + signature("manager")
            )

            # Notify SC MANAGER
            send_email(
                SC_MGR_EMAIL,
                f"MR Approved & Assigned to SC — {data['mr_id']}",
                f"Dear SC Manager,\n\n"
                f"MR {data['mr_id']} has been approved by Manager {data['approved_by']} "
                f"and assigned to Supply Chain for processing.\n\n"
                f"Submitted by : {item['submitted_by_name']}\n"
                f"Vessel       : {item.get('vessel', '—')}\n"
                f"Job No.      : {item.get('job_no', '—')}\n"
                f"Total        : AED {item['total_cost']}\n\n"
                f"Items:\n{itxt}\n\n"
                f"Log in to view:\n{PORTAL_URL}" + signature("system")
            )

            return {"success": True, "status": "APPROVED"}

        # ── Reject MR ─────────────────────────────────────────────────────────
        elif action == "reject_mr":
            table = dynamodb.Table(MR_TABLE)
            item  = table.get_item(Key={"mr_id": data["mr_id"]}).get("Item")
            if not item: return {"error": "MR not found"}

            table.update_item(
                Key={"mr_id": data["mr_id"]},
                UpdateExpression="SET #s=:s, rejected_by=:rb, rejection_reason=:rr, updated_at=:ua",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":s":  "REJECTED",
                    ":rb": data["rejected_by"],
                    ":rr": data["reason"],
                    ":ua": now()
                })

            send_email(
                item["submitted_by_email"],
                f"MR Rejected — {data['mr_id']}",
                f"Dear {item['submitted_by_name']},\n\n"
                f"Your MR {data['mr_id']} has been REJECTED by {data['rejected_by']}.\n\n"
                f"Reason: {data['reason']}\n\n"
                f"Items that were requested:\n{items_text(item.get('items', []))}\n\n"
                f"Log in to review or resubmit:\n{PORTAL_URL}" + signature("manager")
            )

            return {"success": True, "status": "REJECTED"}

        # ── Escalate to HOD (manual) ──────────────────────────────────────────
        elif action == "escalate_to_hod":
            table = dynamodb.Table(MR_TABLE)
            item  = table.get_item(Key={"mr_id": data["mr_id"]}).get("Item")
            if not item: return {"error": "MR not found"}

            table.update_item(
                Key={"mr_id": data["mr_id"]},
                UpdateExpression="SET #s=:s, escalated_by=:eb, escalation_note=:en, updated_at=:ua",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":s":  "PENDING_HOD",
                    ":eb": data.get("escalated_by", "manager"),
                    ":en": data.get("note", "Escalated for HOD review"),
                    ":ua": now()
                })

            send_email(
                item.get("hod_email", HOD_EMAIL),
                f"MR Escalated — Requires Your Approval — {data['mr_id']}",
                f"Dear GM/HOD,\n\n"
                f"MR {data['mr_id']} has been manually escalated for your approval.\n\n"
                f"Submitted by : {item['submitted_by_name']}\n"
                f"Vessel       : {item.get('vessel', '—')}\n"
                f"Total        : AED {item['total_cost']}\n"
                f"Note         : {data.get('note', '')}\n\n"
                f"Items:\n{items_text(item.get('items', []))}\n\n"
                f"Log in to review:\n{PORTAL_URL}" + signature("manager")
            )

            return {"success": True, "status": "PENDING_HOD"}

        # ── SC receive MR + warehouse comment ─────────────────────────────────
        elif action == "sc_receive_mr":
            table = dynamodb.Table(MR_TABLE)
            item  = table.get_item(Key={"mr_id": data["mr_id"]}).get("Item")
            if not item: return {"error": "MR not found"}

            wh_comment = data.get("warehouse_collection_comment", "")
            sc_name    = data.get("sc_received_by_name", "Supply Chain")
            itxt       = items_text(item.get("items", []))

            table.update_item(
                Key={"mr_id": data["mr_id"]},
                UpdateExpression="SET sc_received_by_name=:rn, sc_received_by_id=:ri, sc_received_by_sig=:rs, warehouse_collection_comment=:wc, updated_at=:ua",
                ExpressionAttributeValues={
                    ":rn": sc_name,
                    ":ri": data.get("sc_received_by_id", ""),
                    ":rs": data.get("sc_received_by_sig", ""),
                    ":wc": wh_comment,
                    ":ua": now()
                })

            # Notify USER — MR received with items and comment
            send_email(
                item["submitted_by_email"],
                f"MR Received by Supply Chain — {data['mr_id']}",
                f"Dear {item['submitted_by_name']},\n\n"
                f"Your MR {data['mr_id']} has been received by the Supply Chain team ({sc_name}).\n\n"
                f"Items being processed:\n{itxt}\n\n"
                f"{'Supply Chain Note: ' + wh_comment if wh_comment else 'No additional notes from supply chain.'}\n\n"
                f"Log in to track your MR:\n{PORTAL_URL}" + signature("supply_chain")
            )

            # Notify WAREHOUSE — items to issue with SC comment
            send_email(
                WH_EMAIL,
                f"Items Ready for Issuance — {data['mr_id']}",
                f"Dear Warehouse Team,\n\n"
                f"MR {data['mr_id']} has been processed by Supply Chain ({sc_name}) "
                f"and the following items are ready for issuance:\n\n"
                f"{itxt}\n\n"
                f"Vessel : {item.get('vessel', '—')}\n"
                f"Job No.: {item.get('job_no', '—')}\n"
                f"Total  : AED {item.get('total_cost', '0')}\n\n"
                f"{'Collection Note: ' + wh_comment if wh_comment else ''}\n\n"
                f"Please log in to the Warehouse portal to confirm issuance:\n{PORTAL_URL}" + signature("supply_chain")
            )

            # Notify SC MANAGER
            send_email(
                SC_MGR_EMAIL,
                f"MR Received by SC — {data['mr_id']}",
                f"Dear SC Manager,\n\n"
                f"MR {data['mr_id']} has been received and processed by Supply Chain ({sc_name}).\n\n"
                f"Items being processed:\n{itxt}\n\n"
                f"Vessel : {item.get('vessel', '—')}\n"
                f"Job No.: {item.get('job_no', '—')}\n"
                f"Total  : AED {item.get('total_cost', '0')}\n\n"
                f"{'SC Note: ' + wh_comment if wh_comment else ''}\n\n"
                f"Log in to view:\n{PORTAL_URL}" + signature("system")
            )

            return {"success": True}

        # ── Mark In Process (stock unavailable) ───────────────────────────────
        elif action == "mark_inprocess_mr":
            table = dynamodb.Table(MR_TABLE)
            item  = table.get_item(Key={"mr_id": data["mr_id"]}).get("Item")
            if not item: return {"error": "MR not found"}

            note     = data.get("note", "Items will be issued once stock is available.")
            actioned = data["actioned_by"]
            itxt     = items_text(item.get("items", []))

            table.update_item(
                Key={"mr_id": data["mr_id"]},
                UpdateExpression="SET #s=:s, inprocess_by=:ib, inprocess_note=:in, updated_at=:ua",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":s":  "IN_PROCESS",
                    ":ib": actioned,
                    ":in": note,
                    ":ua": now()
                })

            # Notify USER — stock unavailable with items and note
            send_email(
                item["submitted_by_email"],
                f"MR In Process — Stock Update — {data['mr_id']}",
                f"Dear {item['submitted_by_name']},\n\n"
                f"Your MR {data['mr_id']} is currently IN PROCESS due to stock unavailability.\n\n"
                f"Items pending stock:\n{itxt}\n\n"
                f"Note from Supply Chain: {note}\n\n"
                f"You will be notified once the items are available and ready for issuance.\n\n"
                f"Log in to track:\n{PORTAL_URL}" + signature("supply_chain")
            )

            # Notify WAREHOUSE — heads up on pending stock
            send_email(
                WH_EMAIL,
                f"MR In Process — Awaiting Stock — {data['mr_id']}",
                f"Dear Warehouse Team,\n\n"
                f"MR {data['mr_id']} has been marked as IN PROCESS by Supply Chain ({actioned}).\n\n"
                f"Items currently out of stock:\n{itxt}\n\n"
                f"Note: {note}\n\n"
                f"Please action via the Warehouse portal once stock is available:\n{PORTAL_URL}" + signature("supply_chain")
            )

            # Notify SC MANAGER
            send_email(
                SC_MGR_EMAIL,
                f"MR In Process — Stock Unavailable — {data['mr_id']}",
                f"Dear SC Manager,\n\n"
                f"MR {data['mr_id']} has been marked IN PROCESS by {actioned} due to stock unavailability.\n\n"
                f"Items pending stock:\n{itxt}\n\n"
                f"Note: {note}\n\n"
                f"Vessel : {item.get('vessel', '—')}\n"
                f"Job No.: {item.get('job_no', '—')}\n\n"
                f"Log in to view:\n{PORTAL_URL}" + signature("system")
            )

            return {"success": True, "status": "IN_PROCESS"}

        # ── HOD Approve MR ────────────────────────────────────────────────────
        elif action == "hod_approve_mr":
            table = dynamodb.Table(MR_TABLE)
            item  = table.get_item(Key={"mr_id": data["mr_id"]}).get("Item")
            if not item: return {"error": "MR not found"}

            itxt = items_text(item.get("items", []))

            table.update_item(
                Key={"mr_id": data["mr_id"]},
                UpdateExpression="SET #s=:s, hod_approved_by=:ab, hod_id=:hid, hod_comments=:ac, updated_at=:ua",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":s":  "APPROVED",
                    ":ab": data["approved_by"],
                    ":hid": data.get("approver_id", "H-01"),
                    ":ac": data.get("comments", ""),
                    ":ua": now()
                })

            # Notify submitter
            send_email(
                item["submitted_by_email"],
                f"MR Approved by GM/HOD — {data['mr_id']}",
                f"Dear {item['submitted_by_name']},\n\n"
                f"Your MR {data['mr_id']} has been APPROVED by GM/HOD {data['approved_by']}.\n\n"
                f"Items approved:\n{itxt}\n\n"
                f"Log in to view:\n{PORTAL_URL}" + signature("hod")
            )

            # Notify supply chain
            send_email(
                item.get("assigned_to", SC_EMAIL),
                f"MR Assigned to You — {data['mr_id']}",
                f"Dear Supply Chain Team,\n\n"
                f"MR {data['mr_id']} has been HOD-approved and assigned to you for processing.\n\n"
                f"Submitted by : {item['submitted_by_name']}\n"
                f"Vessel       : {item.get('vessel', '—')}\n"
                f"Job No.      : {item.get('job_no', '—')}\n"
                f"Total        : AED {item['total_cost']}\n\n"
                f"Items to process:\n{itxt}\n\n"
                f"Log in to Supply Chain portal:\n{PORTAL_URL}" + signature("hod")
            )

            # Notify SC MANAGER
            send_email(
                SC_MGR_EMAIL,
                f"MR HOD-Approved & Assigned to SC — {data['mr_id']}",
                f"Dear SC Manager,\n\n"
                f"MR {data['mr_id']} has been approved by HOD {data['approved_by']} "
                f"and assigned to Supply Chain for processing.\n\n"
                f"Submitted by : {item['submitted_by_name']}\n"
                f"Vessel       : {item.get('vessel', '—')}\n"
                f"Job No.      : {item.get('job_no', '—')}\n"
                f"Total        : AED {item['total_cost']}\n\n"
                f"Items:\n{itxt}\n\n"
                f"Log in to view:\n{PORTAL_URL}" + signature("system")
            )

            return {"success": True, "status": "APPROVED"}

        # ── Warehouse issue MR ────────────────────────────────────────────────
        elif action == "warehouse_issue_mr":
            table = dynamodb.Table(MR_TABLE)
            item  = table.get_item(Key={"mr_id": data["mr_id"]}).get("Item")
            if not item: return {"error": "MR not found"}

            itxt      = items_text(item.get("items", []))
            issued_to = data.get("warehouse_issued_to_name", "the recipient")
            issued_by = data.get("issued_by", "Warehouse")
            mr_id_val = data["mr_id"]
            job_no    = item.get("job_no", "—")
            vessel    = item.get("vessel", "—")
            total     = item.get("total_cost", "0")

            warehouse_note = data.get("warehouse_issue_note", "")

            table.update_item(
                Key={"mr_id": mr_id_val},
                UpdateExpression="SET #s=:s, issued_by=:ib, warehouse_issued_to_name=:itn, warehouse_issued_to_id=:iti, warehouse_issue_note=:win, issued_at=:ia, updated_at=:ua",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":s":   "ISSUED",
                    ":ib":  issued_by,
                    ":itn": issued_to,
                    ":iti": data.get("warehouse_issued_to_id", ""),
                    ":win": warehouse_note,
                    ":ia":  now(),
                    ":ua":  now()
                })

            email_body_base = (
                f"Job No.      : {job_no}\n"
                f"Vessel       : {vessel}\n"
                f"MR Number    : {mr_id_val}\n"
                f"Issued To    : {issued_to}\n"
                f"Issued By    : {issued_by}\n"
                f"Total        : AED {total}\n\n"
                f"Items issued:\n{itxt}\n\n"
                + (f"Warehouse Note: {warehouse_note}\n\n" if warehouse_note else "")
                + f"Log in to view full details:\n{PORTAL_URL}" + signature("warehouse")
            )

            # 1. Notify USER (submitter)
            send_email(
                item["submitted_by_email"],
                f"Items Issued — Job No: {job_no} — MR {mr_id_val}",
                f"Dear {item["submitted_by_name"]},\n\n"
                f"Your requested items for Job No: {job_no} have been issued.\n\n"
                + email_body_base
            )

            # 2. Notify MANAGER
            send_email(
                item.get("manager_email", MANAGER_EMAIL),
                f"Items Issued — Job No: {job_no} — MR {mr_id_val}",
                f"Dear Manager (Prapul),\n\n"
                f"Items for Job No: {job_no} have been issued by Warehouse.\n\n"
                + email_body_base
            )

            # 3. Notify HOD — always notify regardless of approval level
            send_email(
                item.get("hod_email", HOD_EMAIL),
                f"Items Issued — Job No: {job_no} — MR {mr_id_val}",
                f"Dear GM/HOD (Swapna),\n\n"
                f"Items for Job No: {job_no} have been issued by Warehouse.\n\n"
                + email_body_base
            )

            # 4. Notify SUPPLY CHAIN
            send_email(
                item.get("assigned_to", SC_EMAIL),
                f"Items Issued — Job No: {job_no} — MR {mr_id_val}",
                f"Dear Supply Chain,\n\n"
                f"Items for Job No: {job_no} have been successfully issued by Warehouse.\n\n"
                + email_body_base
            )

            # 5. Notify SC MANAGER
            send_email(
                SC_MGR_EMAIL,
                f"Items Issued — Job No: {job_no} — MR {mr_id_val}",
                f"Dear SC Manager,\n\n"
                f"Items for Job No: {job_no} have been issued by Warehouse.\n\n"
                + email_body_base
            )

            print(f"Issuance notifications sent to User, Manager, HOD, Supply Chain and SC Manager for {mr_id_val}")
            return {"success": True, "status": "ISSUED"}

        # ── Revert MR ─────────────────────────────────────────────────────────
        elif action == "revert_mr":
            table = dynamodb.Table(MR_TABLE)
            item  = table.get_item(Key={"mr_id": data["mr_id"]}).get("Item")
            if not item: return {"error": "MR not found"}

            table.update_item(
                Key={"mr_id": data["mr_id"]},
                UpdateExpression="SET #s=:s, reverted_by=:rb, updated_at=:ua",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":s":  "PENDING",
                    ":rb": data.get("reverted_by", "manager"),
                    ":ua": now()
                })

            return {"success": True, "status": "PENDING"}

        # ── Proxy document (streams S3 file to browser, fixes CORS) ─────────
        elif action == "proxy_document":
            key = data["s3_key"]
            try:
                obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
                file_data    = obj["Body"].read()
                content_type = obj.get("ContentType", "application/octet-stream")
                filename     = key.split("/")[-1].split("_", 1)[-1]
                return Response(
                    content=file_data,
                    media_type=content_type,
                    headers={"Content-Disposition": f'inline; filename="{filename}"'}
                )
            except Exception as e:
                print(f"Proxy doc error: {e}")
                return {"error": str(e)}


        # ── Chatbot query via Amazon Bedrock (no external API key needed) ──────
        elif action == "chatbot_query":
            import json as _json
            system_prompt = data.get("system", "You are a helpful assistant.")
            messages      = data.get("messages", [])

            # Bedrock region — try eu-central-1 first, fall back to us-east-1
            bedrock_region = os.getenv("BEDROCK_REGION", "eu-central-1")

            # Model ID — Claude Sonnet on Bedrock
            # eu-central-1 uses cross-region inference profile
            model_id = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0"

            bedrock_client = boto3.client(
                "bedrock-runtime",
                region_name = bedrock_region
            )

            bedrock_payload = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens":        1000,
                "system":            system_prompt,
                "messages":          messages,
            }

            try:
                response = bedrock_client.invoke_model(
                    modelId         = model_id,
                    contentType     = "application/json",
                    accept          = "application/json",
                    body            = _json.dumps(bedrock_payload).encode("utf-8"),
                )
                result = _json.loads(response["body"].read())
                reply  = result.get("content", [{}])[0].get("text", "No response.")
                print(f"Chatbot reply generated ({len(reply)} chars)")
                return {"reply": reply}

            except bedrock_client.exceptions.ValidationException as e:
                print(f"Bedrock validation error: {e}")
                return {"reply": "Model not available in this region. Please contact your administrator.", "error": str(e)}
            except Exception as e:
                print(f"Bedrock chatbot error: {e}")
                # Try fallback region us-east-1 if eu-central-1 fails
                if bedrock_region != "us-east-1":
                    print("Retrying with us-east-1...")
                    try:
                        bedrock_us = boto3.client("bedrock-runtime", region_name="us-east-1")
                        model_id_us = "us.anthropic.claude-3-5-sonnet-20241022-v2:0"
                        response = bedrock_us.invoke_model(
                            modelId     = model_id_us,
                            contentType = "application/json",
                            accept      = "application/json",
                            body        = _json.dumps(bedrock_payload).encode("utf-8"),
                        )
                        result = _json.loads(response["body"].read())
                        reply  = result.get("content", [{}])[0].get("text", "No response.")
                        print(f"Fallback chatbot reply generated ({len(reply)} chars)")
                        return {"reply": reply}
                    except Exception as e2:
                        print(f"Fallback also failed: {e2}")
                        return {"reply": "AI service unavailable. Please enable Amazon Bedrock Claude access in your AWS console.", "error": str(e2)}
                return {"reply": "Chatbot unavailable. Please check Bedrock model access.", "error": str(e)}


        # ── Reassign MR (SC Manager) ──────────────────────────────────────────
        elif action == "reassign_mr":
            table = dynamodb.Table(MR_TABLE)
            item  = table.get_item(Key={"mr_id": data["mr_id"]}).get("Item")
            if not item: return {"error": "MR not found"}

            new_assignee  = data["assigned_to"]
            reassigned_by = data.get("reassigned_by", "SC Manager")
            old_assignee  = item.get("assigned_to", "")
            member_name   = next((m["name"] for m in SC_TEAM_LIST if m["email"] == new_assignee), new_assignee)

            table.update_item(
                Key={"mr_id": data["mr_id"]},
                UpdateExpression="SET assigned_to=:at, reassigned_by=:rb, updated_at=:ua",
                ExpressionAttributeValues={":at": new_assignee, ":rb": reassigned_by, ":ua": now()}
            )

            # Notify new assignee
            send_email(
                new_assignee,
                f"MR Assigned to You — {data['mr_id']}",
                f"Dear {member_name},\n\n"
                f"MR {data['mr_id']} has been assigned to you by SC Manager {reassigned_by}.\n\n"
                f"Vessel : {item.get('vessel','—')}\n"
                f"Job No.: {item.get('job_no','—')}\n"
                f"Total  : AED {item.get('total_cost','0')}\n\n"
                f"Log in to Supply Chain portal:\n{PORTAL_URL}" + signature("supply_chain")
            )

            return {"success": True, "assigned_to": new_assignee}


        # ── Resubmit rejected MR ──────────────────────────────────────────────
        elif action == "resubmit_mr":
            table = dynamodb.Table(MR_TABLE)
            item  = table.get_item(Key={"mr_id": data["mr_id"]}).get("Item")
            if not item: return {"error": "MR not found"}

            item_list  = data.get("items", item.get("items", []))
            doc_keys   = data.get("document_s3_keys", item.get("document_s3_keys", []))
            total_cost = sum(float(i.get("estimated_cost", 0)) * int(i.get("qty", 0)) for i in item_list)
            needs_hod  = total_cost > APPROVAL_SLAB
            itxt       = items_text(item_list)

            table.update_item(
                Key={"mr_id": data["mr_id"]},
                UpdateExpression="SET #s=:s, vessel=:v, department=:d, job_no=:j, date_required=:dr, purpose=:p, items=:i, document_s3_keys=:dk, total_cost=:tc, needs_hod_approval=:nh, rejected_by=:rb, rejection_reason=:rr, updated_at=:ua",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":s":  "PENDING",
                    ":v":  data.get("vessel", item.get("vessel", "")),
                    ":d":  data.get("department", item.get("department", "")),
                    ":j":  data.get("job_no", item.get("job_no", "")),
                    ":dr": data.get("date_required", item.get("date_required", "")),
                    ":p":  data.get("purpose", item.get("purpose", "")),
                    ":i":  item_list,
                    ":dk": doc_keys,
                    ":tc": str(round(total_cost, 2)),
                    ":nh": needs_hod,
                    ":rb": "",
                    ":rr": "",
                    ":ua": now()
                })

            # Notify USER - confirmation
            send_email(
                item["submitted_by_email"],
                f"MR Resubmitted — {data['mr_id']}",
                f"Dear {item['submitted_by_name']},\n\n"
                f"Your MR {data['mr_id']} has been resubmitted successfully.\n\n"
                f"Items:\n{itxt}\n\n"
                f"Total  : AED {total_cost:,.2f}\n"
                f"Status : Pending Manager Approval\n\n"
                f"Log in to track:\n{PORTAL_URL}" + signature("system")
            )

            # Notify MANAGER
            send_email(
                item.get("manager_email", MANAGER_EMAIL),
                f"MR Resubmitted — Requires Your Review — {data['mr_id']}",
                f"MR {data['mr_id']} has been resubmitted by {item['submitted_by_name']} after rejection.\n\n"
                f"Vessel     : {item.get('vessel', '—')}\n"
                f"Job No.    : {item.get('job_no', '—')}\n"
                f"Total      : AED {total_cost:,.2f}\n\n"
                f"Items:\n{itxt}\n\n"
                f"{'NOTE: Amount exceeds AED ' + str(APPROVAL_SLAB) + '. Will require HOD approval after your review.' if needs_hod else ''}\n\n"
                f"Log in to review:\n{PORTAL_URL}" + signature("system")
            )

            # Notify HOD if above slab
            if needs_hod:
                send_email(
                    item.get("hod_email", HOD_EMAIL),
                    f"MR Resubmitted — FYI — {data['mr_id']}",
                    f"MR {data['mr_id']} has been resubmitted by {item['submitted_by_name']}.\n"
                    f"Amount AED {total_cost:,.2f} exceeds AED {APPROVAL_SLAB:,.0f} — will reach you for second-level approval after manager review.\n\n"
                    f"Log in to view:\n{PORTAL_URL}" + signature("system")
                )

            return {"success": True, "mr_id": data["mr_id"], "status": "PENDING"}

        return {"error": f"Unknown action: {action}"}

    except Exception as e:
        import traceback
        print(f"ERROR [{action}]: {e}")
        traceback.print_exc()
        return {"error": str(e)}


@app.get("/invoke-proxy")
async def proxy_document(s3_key: str):
    """Proxy S3 files through the backend to avoid browser CORS issues."""
    try:
        obj          = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        file_data    = obj["Body"].read()
        content_type = obj.get("ContentType", "application/octet-stream")
        filename     = s3_key.split("/")[-1].split("_", 1)[-1]
        return Response(
            content=file_data,
            media_type=content_type,
            headers={
                "Content-Disposition": f'inline; filename="{filename}"',
                "Cache-Control": "max-age=3600",
            }
        )
    except Exception as e:
        print(f"Proxy error for {s3_key}: {e}")
        return Response(content=f"Error: {str(e)}", status_code=404)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
