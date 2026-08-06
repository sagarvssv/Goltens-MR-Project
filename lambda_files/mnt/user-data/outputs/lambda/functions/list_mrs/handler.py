"""Lambda: list_mrs — Returns MRs filtered by status and role"""
import json, sys
sys.path.insert(0, "/opt/python")
from shared_utils import *
from boto3.dynamodb.conditions import Attr

def handler(event, context):
    try:
        body = json.loads(event.get("body","{}")) if isinstance(event.get("body"),str) else event.get("body",{})
        status_filter = body.get("status_filter", "ALL")

        table = dynamodb.Table(MR_TABLE)
        if status_filter == "ALL":
            result = table.scan()
        else:
            result = table.scan(FilterExpression=Attr("status").eq(status_filter))

        items = result.get("Items", [])
        # Handle pagination
        while "LastEvaluatedKey" in result:
            result = table.scan(ExclusiveStartKey=result["LastEvaluatedKey"])
            items.extend(result.get("Items", []))

        # Sort by created_at descending
        items.sort(key=lambda x: x.get("created_at",""), reverse=True)
        return response({"mrs": items, "count": len(items)})
    except Exception as e:
        return error(str(e), 500)
