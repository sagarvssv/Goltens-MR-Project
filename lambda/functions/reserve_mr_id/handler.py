"""Lambda: reserve_mr_id — Generates unique MR ID"""
import json, sys, uuid
sys.path.insert(0, "/opt/python")
from shared_utils import *

def handler(event, context):
    try:
        date_str = now()[:10].replace("-","")
        uid      = uuid.uuid4().hex[:6].upper()
        mr_id    = f"MR-{date_str}-{uid}"
        return response({"mr_id": mr_id})
    except Exception as e:
        return error(str(e), 500)
