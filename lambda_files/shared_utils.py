"""
shared_utils.py — Common utilities for all Lambda functions
Imported as a layer by all Lambda functions
"""
import os
import json
import boto3
import uuid
from datetime import datetime, timezone
from botocore.exceptions import ClientError

# ── AWS Clients ───────────────────────────────────────────────────────────────
dynamodb    = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "eu-central-1"))
ses_client  = boto3.client("ses",        region_name=os.environ.get("AWS_REGION", "eu-central-1"))
s3_client   = boto3.client("s3",         region_name=os.environ.get("AWS_REGION", "eu-central-1"))

# ── Config ────────────────────────────────────────────────────────────────────
MR_TABLE     = os.environ.get("MR_TABLE",    "goltens-mr-forms")
USERS_TABLE  = os.environ.get("USERS_TABLE", "goltens-users")
S3_BUCKET    = os.environ.get("S3_BUCKET",   "goltens-mr-documents")
SES_SENDER   = os.environ.get("SES_SENDER",  "shashikanth.k@vcloudmaster.com")
PORTAL_URL   = os.environ.get("PORTAL_URL",  "http://localhost:5173")
APPROVAL_SLAB = float(os.environ.get("APPROVAL_SLAB", "5000"))

MANAGER_EMAIL = os.environ.get("MANAGER_EMAIL", "pramod.r@goltens.com")
HOD_EMAIL     = os.environ.get("HOD_EMAIL",     "gineesh.kg@goltens.com")
SC_EMAIL      = os.environ.get("SC_EMAIL",      "nithya.prabhakar@goltens.com")
SC_MGR_EMAIL  = os.environ.get("SC_MGR_EMAIL",  "girish.malhotra@goltens.com")
WH_EMAIL      = os.environ.get("WH_EMAIL",      "john.pepset@goltens.com")

SC_TEAM_LIST = [
    {"name": "Nithya Prabhakar", "email": "nithya.prabhakar@goltens.com"},
    {"name": "Supply Chain 1",   "email": "sc1@goltens.com"},
    {"name": "Supply Chain 2",   "email": "sc2@goltens.com"},
    {"name": "Supply Chain 3",   "email": "sc3@goltens.com"},
    {"name": "Supply Chain 4",   "email": "sc4@goltens.com"},
]

# ── Helpers ───────────────────────────────────────────────────────────────────
def now():
    return datetime.now(timezone.utc).isoformat()

def response(body, status=200):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGINS", "*"),
            "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Api-Key",
            "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
        },
        "body": json.dumps(body),
    }

def error(msg, status=400):
    return response({"error": msg}, status)

def items_text(items):
    if not items:
        return "No items listed."
    lines = []
    for it in items:
        lines.append(
            f"  - {it.get('description','—')} | "
            f"Qty: {it.get('qty','?')} {it.get('uom','')} | "
            f"Code: {it.get('item_code','—')} | "
            f"Est: AED {it.get('estimated_cost','0')}"
        )
    return "\n".join(lines)

def signature(role):
    sigs = {
        "manager":      "\n\nBest regards,\nPramod Raveendran\nManager, Goltens Co. Ltd. Dubai Branch",
        "hod":          "\n\nBest regards,\nGineesh K Gireesan\nGM / HOD, Goltens Co. Ltd. Dubai Branch",
        "supply_chain": "\n\nBest regards,\nNithya Prabhakar\nSupply Chain, Goltens Co. Ltd. Dubai Branch",
        "warehouse":    "\n\nBest regards,\nJohn Pepset\nWarehouse, Goltens Co. Ltd. Dubai Branch",
        "system":       "\n\nBest regards,\nGoltens MR Portal\nGoltens Co. Ltd. Dubai Branch",
    }
    return sigs.get(role, sigs["system"])

def send_email(to_email, subject, body):
    """Send email via SES. Silently fails if not verified."""
    if not to_email:
        return
    try:
        ses_client.send_email(
            Source=SES_SENDER,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": f"[Goltens MR Portal] {subject}"},
                "Body":    {"Text": {"Data": body}},
            },
        )
        print(f"Email sent to {to_email}: {subject}")
    except ClientError as e:
        print(f"SES error sending to {to_email}: {e}")

def get_mr(mr_id):
    """Fetch a single MR from DynamoDB."""
    table = dynamodb.Table(MR_TABLE)
    result = table.get_item(Key={"mr_id": mr_id})
    return result.get("Item")

def verify_cognito_token(event):
    """Extract and verify Cognito JWT from Authorization header."""
    auth_header = event.get("headers", {}).get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, "Missing token"
    token = auth_header.split(" ", 1)[1]
    # Token validation is handled by API Gateway Cognito authorizer
    # Here we just decode the claims from the JWT payload
    import base64
    try:
        payload = token.split(".")[1]
        # Add padding
        payload += "=" * (4 - len(payload) % 4)
        claims = json.loads(base64.b64decode(payload))
        return claims, None
    except Exception as e:
        return None, str(e)
