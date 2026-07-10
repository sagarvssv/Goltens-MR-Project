"""Lambda: get_upload_url — Generates S3 presigned upload URL"""
import json, sys, uuid
sys.path.insert(0, "/opt/python")
from shared_utils import *

def handler(event, context):
    try:
        body      = json.loads(event.get("body","{}")) if isinstance(event.get("body"),str) else event.get("body",{})
        mr_id     = body.get("mr_id","unknown")
        filename  = body.get("filename","document")
        file_type = body.get("file_type","application/octet-stream")

        key = f"mr-documents/{mr_id}/{uuid.uuid4().hex}_{filename}"
        url = s3_client.generate_presigned_url(
            "put_object",
            Params={"Bucket": S3_BUCKET, "Key": key, "ContentType": file_type},
            ExpiresIn=int(os.environ.get("PRESIGN_EXPIRY", 3600)),
        )
        return response({"upload_url": url, "s3_key": key})
    except Exception as e:
        return error(str(e), 500)
