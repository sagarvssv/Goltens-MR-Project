"""Lambda: get_user_profile"""
import json, sys
sys.path.insert(0, "/opt/python")
from shared_utils import *

def handler(event, context):
    try:
        body = json.loads(event.get("body","{}")) if isinstance(event.get("body"),str) else event.get("body",{})
        email = body.get("email","").lower().strip()
        if not email:
            return error("Email required")
        table = dynamodb.Table(USERS_TABLE)
        result = table.get_item(Key={"email": email})
        item = result.get("Item")
        if not item:
            return error("User not found", 404)
        return response(item)
    except Exception as e:
        return error(str(e), 500)
