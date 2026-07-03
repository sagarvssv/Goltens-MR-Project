const AGENT_ENDPOINT = import.meta.env.VITE_AGENT_ENDPOINT || "/invoke";

async function call(action, data = {}) {
  const res = await fetch(AGENT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
  });
  if (!res.ok) throw new Error(`API call failed: ${res.status}`);
  return res.json();
}

export const getUserProfile  = (email)                          => call("get_user_profile",  { email });
export const getUploadUrl    = (file_name, file_type, mr_id)    => call("get_upload_url",    { file_name, file_type, mr_id });
export const submitMR        = (data)                           => call("submit_mr",          data);
export const listMRs         = (status_filter = "ALL")          => call("list_mrs",           { status_filter });
export const approveMR       = (mr_id, approved_by, comments="")=> call("approve_mr",         { mr_id, approved_by, comments });
export const rejectMR        = (mr_id, rejected_by, reason)     => call("reject_mr",          { mr_id, rejected_by, reason });
export const markInProcessMR = (mr_id, actioned_by, note="")    => call("mark_inprocess_mr",  { mr_id, actioned_by, note });
export const deleteDocument  = (mr_id, s3_key)                  => call("delete_document",    { mr_id, s3_key });

/**
 * Get document list for an MR.
 * Returns [{s3_key, file_name, url}] where url is a fresh presigned S3 URL.
 */
export const getDocumentUrls = async (mr_id) => {
  const result = await call("get_document_urls", { mr_id });
  const docs   = Array.isArray(result) ? result : (result?.documents || []);
  return docs;
};

/**
 * Fetch a document from S3 via the backend proxy and return a blob object URL.
 * This avoids all S3 CORS issues — the backend fetches it and streams it back.
 * Returns a blob URL string like "blob:http://localhost:5173/..."
 */
export const fetchDocumentBlob = async (s3_key) => {
  const res = await fetch(`/invoke-proxy?s3_key=${encodeURIComponent(s3_key)}`);
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
};

/**
 * Upload file via base64 through dev_server — avoids S3 presigned URL CORS issues.
 */
export const uploadFileToS3 = async (s3Key, file) => {
  const buffer = await file.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  let binary   = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const res = await call("upload_document", {
    s3_key:    s3Key,
    content:   base64,
    file_type: file.type,
  });
  if (!res?.success) throw new Error("Upload failed");
  return true;
};
