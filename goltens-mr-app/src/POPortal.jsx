import { useState, useEffect } from "react";
import GoltensLogo from "./GoltensLogo";
import { G } from "./theme";
import HelpChatbot from "./HelpChatbot";
import NotificationBell from "./NotificationBell";

// ── API helper ──────────────────────────────────────────────────────
async function call(action, data = {}) {
  const endpoint = import.meta.env.VITE_API_ENDPOINT || "/invoke";
  const token = (() => {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith("oidc.user:"));
      for (const k of keys) {
        const parsed = JSON.parse(localStorage.getItem(k) || "{}");
        if (parsed.id_token) return parsed.id_token;
      }
    } catch (e) {}
    return "";
  })();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ action, data }) });
  if (!res.ok) throw new Error(`${res.status}`);
  const result = await res.json();
  if (result && typeof result.body === "string") { try { return JSON.parse(result.body); } catch { return result; } }
  return result;
}

// ── Status badge ────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    PENDING_SC_MANAGER: { label: "Pending SC Manager", color: "#f39c12", bg: "#fef9e7" },
    APPROVED:           { label: "Approved",           color: "#27ae60", bg: "#eafaf1" },
    REJECTED:           { label: "Rejected",           color: "#e74c3c", bg: "#fdedec" },
  };
  const s = map[status] || { label: status, color: "#888", bg: "#f5f5f5" };
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}`, borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
      {s.label}
    </span>
  );
};

// ── Upload PO Panel (SC Staff) ───────────────────────────────────────
function UploadPOPanel({ session, onUploaded }) {
  const [file, setFile]         = useState(null);
  const [poNumber, setPoNumber] = useState("");
  const [vendor, setVendor]     = useState("");
  const [amount, setAmount]     = useState("");
  const [notes, setNotes]       = useState("");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg]           = useState("");

  const handleUpload = async () => {
    if (!file || !poNumber) { setMsg("Please select a PDF file and enter a PO number."); return; }
    setUploading(true); setMsg("");
    try {
      // Step 1: Get upload URL
      const { upload_url, po_id, s3_key } = await call("upload_po_url", {
        po_number: poNumber, file_name: file.name, file_type: file.type,
        uploaded_by_id: session?.id_no, uploaded_by_name: session?.name,
        uploaded_by_email: session?.email, vendor, amount, notes
      });

      // Step 2: Upload PDF directly to S3
      await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });

      // Step 3: Confirm upload and create PO record
      await call("confirm_po_upload", { po_id, s3_key });

      setMsg("✅ PO uploaded successfully and sent to SC Manager for approval.");
      setFile(null); setPoNumber(""); setVendor(""); setAmount(""); setNotes("");
      if (onUploaded) onUploaded();
    } catch (e) {
      setMsg(`❌ Upload failed: ${e.message}`);
    }
    setUploading(false);
  };

  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 28, boxShadow: "0 2px 12px #0001", maxWidth: 560 }}>
      <h3 style={{ margin: "0 0 20px", color: G.dark, fontSize: 18 }}>📤 Upload Purchase Order</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#555", display: "block", marginBottom: 4 }}>PO Number *</label>
          <input value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="e.g. PO-2026-001"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }} />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#555", display: "block", marginBottom: 4 }}>Vendor Name</label>
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Al Futtaim Trading"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }} />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#555", display: "block", marginBottom: 4 }}>Total Amount (AED)</label>
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 15000"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }} />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#555", display: "block", marginBottom: 4 }}>Notes / Remarks</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes for SC Manager..."
            rows={3} style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", resize: "vertical" }} />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#555", display: "block", marginBottom: 4 }}>PO Document (PDF) *</label>
          <input type="file" accept=".pdf" onChange={e => setFile(e.target.files[0])}
            style={{ width: "100%", padding: "9px 0", fontSize: 14 }} />
          {file && <div style={{ fontSize: 12, color: "#27ae60", marginTop: 4 }}>📎 {file.name} ({(file.size/1024).toFixed(1)} KB)</div>}
        </div>

        {msg && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: msg.startsWith("✅") ? "#eafaf1" : "#fdedec",
            color: msg.startsWith("✅") ? "#27ae60" : "#e74c3c", fontSize: 13, fontWeight: 500 }}>
            {msg}
          </div>
        )}

        <button onClick={handleUpload} disabled={uploading}
          style={{ background: uploading ? "#aaa" : G.primary, color: "#fff", border: "none", borderRadius: 8,
            padding: "11px 0", fontWeight: 700, fontSize: 15, cursor: uploading ? "not-allowed" : "pointer" }}>
          {uploading ? "Uploading..." : "Upload PO for Approval"}
        </button>
      </div>
    </div>
  );
}

// ── PO List ──────────────────────────────────────────────────────────
function POCard({ po, onClick, showActions, onApprove, onReject, actionMsg, actioning }) {
  const [rejComment, setRejComment] = useState("");
  const [showReject, setShowReject] = useState(false);

  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 2px 8px #0001", marginBottom: 14,
      border: "1px solid #eee", cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: G.dark }}>{po.po_number}</div>
          {po.vendor && <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Vendor: {po.vendor}</div>}
          {po.amount && <div style={{ fontSize: 13, color: "#666" }}>Amount: AED {Number(po.amount).toLocaleString()}</div>}
          <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
            Uploaded by: {po.uploaded_by_name} &nbsp;|&nbsp; {new Date(po.uploaded_at).toLocaleDateString()}
          </div>
          {po.notes && <div style={{ fontSize: 12, color: "#777", marginTop: 4, fontStyle: "italic" }}>"{po.notes}"</div>}
          {po.rejection_comment && (
            <div style={{ fontSize: 12, color: "#e74c3c", marginTop: 4 }}>Rejection reason: {po.rejection_comment}</div>
          )}
        </div>
        <StatusBadge status={po.status} />
      </div>

      {po.pdf_url && (
        <a href={po.pdf_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
          style={{ display: "inline-block", marginTop: 10, fontSize: 13, color: G.primary, fontWeight: 600, textDecoration: "none" }}>
          📄 View PO Document
        </a>
      )}

      {showActions && po.status === "PENDING_SC_MANAGER" && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }} onClick={e => e.stopPropagation()}>
          {!showReject ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => onApprove(po.po_id)} disabled={actioning}
                style={{ flex: 1, background: "#27ae60", color: "#fff", border: "none", borderRadius: 7, padding: "9px 0", fontWeight: 700, cursor: "pointer" }}>
                ✅ Approve PO
              </button>
              <button onClick={() => setShowReject(true)} disabled={actioning}
                style={{ flex: 1, background: "#e74c3c", color: "#fff", border: "none", borderRadius: 7, padding: "9px 0", fontWeight: 700, cursor: "pointer" }}>
                ❌ Reject PO
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea value={rejComment} onChange={e => setRejComment(e.target.value)}
                placeholder="Enter rejection reason..." rows={2}
                style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13, resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => onReject(po.po_id, rejComment)} disabled={actioning}
                  style={{ flex: 1, background: "#e74c3c", color: "#fff", border: "none", borderRadius: 7, padding: "8px 0", fontWeight: 700, cursor: "pointer" }}>
                  Confirm Rejection
                </button>
                <button onClick={() => setShowReject(false)}
                  style={{ flex: 1, background: "#eee", color: "#333", border: "none", borderRadius: 7, padding: "8px 0", fontWeight: 600, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {actionMsg && (
            <div style={{ padding: "8px 12px", borderRadius: 7, background: actionMsg.startsWith("✅") ? "#eafaf1" : "#fdedec",
              color: actionMsg.startsWith("✅") ? "#27ae60" : "#e74c3c", fontSize: 13, fontWeight: 500 }}>
              {actionMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main PO Portal ───────────────────────────────────────────────────
export default function POPortal({ session, onLogout, role, onNavigate }) {
  const [pos, setPos]         = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState(role === "supply_chain" ? "upload" : "approvals");
  const [actionMsg, setActionMsg] = useState({});
  const [actioning, setActioning] = useState(false);

  const isSCManager  = role === "sc_manager";
  const isSCStaff    = role === "supply_chain";

  const loadPOs = async () => {
    setLoading(true);
    try {
      const result = await call("list_pos", { uploader_email: isSCStaff ? session?.email : null });
      setPos(result?.pos || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { if (session?.email) { loadPOs(); } }, [session?.email]);

  const handleApprove = async (po_id) => {
    setActioning(true);
    setActionMsg(prev => ({ ...prev, [po_id]: "" }));
    try {
      await call("approve_po", { po_id, approved_by_name: session?.name, approved_by_email: session?.email });
      setActionMsg(prev => ({ ...prev, [po_id]: "✅ PO approved successfully." }));
      setTimeout(loadPOs, 1500);
    } catch (e) {
      setActionMsg(prev => ({ ...prev, [po_id]: `❌ Error: ${e.message}` }));
    }
    setActioning(false);
  };

  const handleReject = async (po_id, comment) => {
    if (!comment.trim()) { setActionMsg(prev => ({ ...prev, [po_id]: "❌ Please enter a rejection reason." })); return; }
    setActioning(true);
    try {
      await call("reject_po", { po_id, rejected_by_name: session?.name, rejected_by_email: session?.email, rejection_comment: comment });
      setActionMsg(prev => ({ ...prev, [po_id]: "✅ PO rejected." }));
      setTimeout(loadPOs, 1500);
    } catch (e) {
      setActionMsg(prev => ({ ...prev, [po_id]: `❌ Error: ${e.message}` }));
    }
    setActioning(false);
  };

  const navStyle = (v) => ({
    padding: "8px 18px", borderRadius: 7, fontWeight: 600, fontSize: 14, cursor: "pointer", border: "none",
    background: view === v ? G.primary : "#f0f0f0", color: view === v ? "#fff" : "#444"
  });

  const pendingCount = pos.filter(p => p.status === "PENDING_SC_MANAGER").length;

  return (
    <div style={{ minHeight: "100vh", background: G.bg, fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e8e8", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <GoltensLogo size={36} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: G.dark }}>PO Approval Portal</div>
            <div style={{ fontSize: 11, color: "#888" }}>{session?.name} — {role === "sc_manager" ? "SC Manager" : "Supply Chain"}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <NotificationBell mrs={[]} role={role} userEmail={session?.email} accentColor="#1B6CA8" onNavigate={onNavigate} />
          <button onClick={onLogout} style={{ background: "none", border: "1px solid #ddd", borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontSize: 13, color: "#666" }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 16px" }}>

        {/* Navigation tabs */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
          {isSCStaff && <button style={navStyle("upload")} onClick={() => setView("upload")}>📤 Upload PO</button>}
          <button style={navStyle("my_pos")} onClick={() => { setView("my_pos"); loadPOs(); }}>
            📋 {isSCStaff ? "My Uploaded POs" : "All POs"}
          </button>
          {isSCManager && (
            <button style={navStyle("approvals")} onClick={() => { setView("approvals"); loadPOs(); }}>
              🔔 Pending Approvals {pendingCount > 0 && <span style={{ background: "#e74c3c", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, marginLeft: 6 }}>{pendingCount}</span>}
            </button>
          )}
        </div>

        {/* Upload PO */}
        {view === "upload" && isSCStaff && (
          <UploadPOPanel session={session} onUploaded={() => { loadPOs(); }} />
        )}

        {/* My Uploaded POs (SC Staff) / All POs (SC Manager) */}
        {view === "my_pos" && (
          <div>
            <h3 style={{ margin: "0 0 16px", color: G.dark }}>
              {isSCStaff ? "My Uploaded POs" : "All Purchase Orders"}
            </h3>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</div>
            ) : pos.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#aaa", background: "#fff", borderRadius: 10 }}>
                No purchase orders found.
              </div>
            ) : (
              pos.map(po => (
                <POCard key={po.po_id} po={po} showActions={false}
                  actionMsg={actionMsg[po.po_id]} actioning={actioning} />
              ))
            )}
          </div>
        )}

        {/* Pending Approvals (SC Manager) */}
        {view === "approvals" && isSCManager && (
          <div>
            <h3 style={{ margin: "0 0 16px", color: G.dark }}>
              POs Pending Your Approval
              {pendingCount > 0 && <span style={{ background: "#e74c3c", color: "#fff", borderRadius: 10, padding: "2px 10px", fontSize: 13, marginLeft: 10 }}>{pendingCount} pending</span>}
            </h3>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</div>
            ) : pos.filter(p => p.status === "PENDING_SC_MANAGER").length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#aaa", background: "#fff", borderRadius: 10 }}>
                ✅ No pending POs for approval.
              </div>
            ) : (
              pos.filter(p => p.status === "PENDING_SC_MANAGER").map(po => (
                <POCard key={po.po_id} po={po} showActions={true}
                  onApprove={handleApprove} onReject={handleReject}
                  actionMsg={actionMsg[po.po_id]} actioning={actioning} />
              ))
            )}

            {/* Show approved/rejected below */}
            {pos.filter(p => p.status !== "PENDING_SC_MANAGER").length > 0 && (
              <div style={{ marginTop: 28 }}>
                <h4 style={{ color: "#888", marginBottom: 12 }}>Previously Actioned POs</h4>
                {pos.filter(p => p.status !== "PENDING_SC_MANAGER").map(po => (
                  <POCard key={po.po_id} po={po} showActions={false} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <HelpChatbot session={session} portalRole={role} />
    </div>
  );
}