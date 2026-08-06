"""Lambda: get_document_urls — Returns presigned download URLs for MR docs"""
import json, sys
sys.path.insert(0, "/opt/python")
from shared_utils import *

def handler(event, context):
    try:
        body  = json.loads(event.get("body","{}")) if isinstance(event.get("body"),str) else event.get("body",{})
        mr_id = body.get("mr_id")
        item  = get_mr(mr_id)
        if not item: return error("MR not found", 404)

        keys = item.get("document_s3_keys", [])
        urls = []
        for key in keys:
            url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": S3_BUCKET, "Key": key},
                ExpiresIn=int(os.environ.get("PRESIGN_EXPIRY", 3600)),
            )
            urls.append({"key": key, "url": url, "filename": key.split("/")[-1]})
        return response({"documents": urls})
    except Exception as e:
        return error(str(e), 500)
