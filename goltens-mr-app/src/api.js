/**
 * api.js — Goltens MR Portal API
 * Calls backend Lambda via API Gateway
 * Auth token injected from Cognito via react-oidc-context
 */

const ENDPOINT = import.meta.env.VITE_API_ENDPOINT || "/invoke";

// Token is set by App when user logs in
let _idToken = "";
export function setAuthToken(token) { _idToken = token; }

async function call(action, data = {}) {
  const headers = { "Content-Type": "application/json" };
  if (_idToken) headers["Authorization"] = `Bearer ${_idToken}`;

  const res = await fetch(ENDPOINT, {
    method:  "POST",
    headers,
    body:    JSON.stringify({ action, data }),
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const result = await res.json();
  console.log(`API [${action}] raw result:`, JSON.stringify(result).slice(0, 200));

  // API Gateway may return Lambda response wrapper {statusCode, headers, body}
  // or it may return the parsed body directly
  if (result && typeof result.body === "string") {
    try { return JSON.parse(result.body); } catch { return result; }
  }
  // Already parsed - return as is
  return result;
}

// ── Exports ───────────────────────────────────────────────────────────────────
export const getUserProfile  = (email)                                               => call("get_user_profile",   { email });
export const getUploadUrl    = (mr_id, filename, file_type)                          => call("get_upload_url",     { mr_id, filename, file_type });
export const getDocumentUrls = (mr_id)                                               => call("get_document_urls",  { mr_id });
export const submitMR        = (data)                                                => call("submit_mr",          data);
export const listMRs         = (status_filter = "ALL")                               => call("list_mrs",           { status_filter }).then(r => Array.isArray(r) ? r : (r.mrs || r || []));
export const approveMR       = (mr_id, approved_by, comments = "", approver_id = "") => call("approve_mr",         { mr_id, approved_by, comments, approver_id });
export const rejectMR        = (mr_id, rejected_by, reason)                          => call("reject_mr",          { mr_id, rejected_by, reason });

export async function uploadFileToS3(uploadUrl, file) {
  const res = await fetch(uploadUrl, {
    method:  "PUT",
    headers: { "Content-Type": file.type },
    body:    file,
  });
  if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
  return true;
}

export async function fetchDocumentBlob(url) {
  // Fetch a presigned S3 URL and return as blob for PDF download
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
  return res.blob();
}

export const proxyDocument = (s3_key) => call("proxy_document", { s3_key });