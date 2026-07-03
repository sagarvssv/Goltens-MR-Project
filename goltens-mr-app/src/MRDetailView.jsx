/**
 * MRDetailView.jsx
 * Complete read-only MR form view used in all portals.
 * Documents are fetched via backend proxy as blobs — fixes all S3 CORS/viewing issues.
 */
import { useState, useEffect, useCallback } from "react";
import { getDocumentUrls, fetchDocumentBlob } from "./api";
import MRStageTracker from "./MRStageTracker";
import { createPortal } from "react-dom";
import GoltensLogo from "./GoltensLogo";
import { G } from "./theme";

const isImage = n => /\.(jpg|jpeg|png|gif|webp)$/i.test(n || "");
const isPdf   = n => /\.pdf$/i.test(n || "");

// ── Preview Modal ──────────────────────────────────────────────────────────────
function PreviewModal({ doc, onClose }) {
  const [blobUrl, setBlobUrl]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    let revoked = false;
    setLoading(true);
    setError(null);
    fetchDocumentBlob(doc.s3_key)
      .then(url => { if (!revoked) { setBlobUrl(url); setLoading(false); } })
      .catch(err => { if (!revoked) { setError(err.message); setLoading(false); } });
    return () => {
      revoked = true;
      // Revoke blob URL on unmount to free memory
      setBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [doc.s3_key]);

  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl; a.download = doc.file_name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return createPortal(
    <div style={dv.overlay} onMouseDown={onClose}>
      <div style={dv.modal} onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div style={dv.modalHeader}>
          <span style={dv.modalTitle}>
            {isImage(doc.file_name) ? "🖼️" : isPdf(doc.file_name) ? "📄" : "📎"} {doc.file_name}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={dv.dlBtn} onClick={handleDownload} disabled={!blobUrl}>⬇ Download</button>
            <button style={dv.closeBtn} onClick={onClose}>✕ Close</button>
          </div>
        </div>

        {/* Body */}
        <div style={dv.modalBody}>
          {loading && (
            <div style={dv.loadingState}>
              <div style={dv.spinner}/>
              <div style={{ color: G.muted, marginTop: 12, fontSize: 13 }}>Loading document…</div>
            </div>
          )}
          {error && (
            <div style={dv.errorState}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
              <div style={{ color: G.danger, marginBottom: 16 }}>Could not load document: {error}</div>
              <a href={`/invoke-proxy?s3_key=${encodeURIComponent(doc.s3_key)}`}
                target="_blank" rel="noopener noreferrer" style={dv.openLink}>
                Try opening directly ↗
              </a>
            </div>
          )}
          {!loading && !error && blobUrl && (
            isImage(doc.file_name)
              ? <img src={blobUrl} alt={doc.file_name} style={dv.previewImg} />
              : isPdf(doc.file_name)
              ? <iframe src={blobUrl} style={dv.previewFrame} title={doc.file_name} />
              : (
                <div style={dv.noPreview}>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>📎</div>
                  <div style={{ color: G.muted, marginBottom: 20, fontSize: 13 }}>{doc.file_name}</div>
                  <button style={dv.dlLinkLg} onClick={handleDownload}>⬇ Download File</button>
                </div>
              )
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Doc Section ────────────────────────────────────────────────────────────────
function DocSection({ mrId }) {
  const [docs, setDocs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    getDocumentUrls(mrId)
      .then(d => { if (!cancelled) setDocs(Array.isArray(d) ? d : []); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mrId]);

  const openPreview  = useCallback((doc) => setPreview(doc), []);
  const closePreview = useCallback(() => setPreview(null), []);

  if (loading) return <div style={dv.statusMsg}>⏳ Loading documents…</div>;
  if (error)   return <div style={{ ...dv.statusMsg, color: G.danger }}>⚠️ Error: {error}</div>;
  if (!docs || docs.length === 0) return <div style={dv.statusMsg}>No supporting documents attached.</div>;

  return (
    <div style={{ padding: "8px 0 20px" }}>
      <div style={dv.grid}>
        {docs.map((doc, i) => (
          <DocCard key={i} doc={doc} onPreview={openPreview} />
        ))}
      </div>
      {preview && <PreviewModal doc={preview} onClose={closePreview} />}
    </div>
  );
}

// ── Doc Card (thumbnail with lazy blob load) ───────────────────────────────────
function DocCard({ doc, onPreview }) {
  const [thumbUrl, setThumbUrl] = useState(null);

  useEffect(() => {
    if (!isImage(doc.file_name)) return;
    let revoked = false;
    fetchDocumentBlob(doc.s3_key)
      .then(url => { if (!revoked) setThumbUrl(url); })
      .catch(() => {});
    return () => {
      revoked = true;
      setThumbUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [doc.s3_key]);

  const handleDownload = async () => {
    try {
      const url = await fetchDocumentBlob(doc.s3_key);
      const a = document.createElement("a");
      a.href = url; a.download = doc.file_name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch(e) { alert("Download failed: " + e.message); }
  };

  return (
    <div style={dv.card}>
      <div style={dv.thumbArea} onClick={() => onPreview(doc)}>
        {isImage(doc.file_name) && thumbUrl
          ? <img src={thumbUrl} alt={doc.file_name} style={dv.thumb} />
          : <div style={dv.fileIcon}>{isPdf(doc.file_name) ? "📄" : "📎"}</div>
        }
      </div>
      <div style={dv.docName} title={doc.file_name}>
        {doc.file_name && doc.file_name.length > 20 ? doc.file_name.slice(0, 18) + "…" : doc.file_name}
      </div>
      <div style={dv.docBtns}>
        <button style={dv.viewBtn} onClick={() => onPreview(doc)}>👁 View</button>
        <button style={dv.dlBtn2} onClick={handleDownload}>⬇</button>
      </div>
    </div>
  );
}

// ── MRDetailView ───────────────────────────────────────────────────────────────
export default function MRDetailView({ mr, onDownloadPDF, showDownload = true }) {
  const [activeTab, setActiveTab] = useState("form");

  const signatories = [
    { title: "Requested By",    name: mr.submitted_by_name      || "", id_no: mr.submitted_by_id_no     || "", signature: "" },
    { title: "Approved By",     name: mr.hod_approved_by || mr.approved_by || mr.manager_approved_by || "", id_no: "", signature: "" },
    { title: "M.R. Received By",name: mr.sc_received_by_name    || "", id_no: mr.sc_received_by_id      || "", signature: mr.sc_received_by_sig || "" },
    { title: "Items Issued To", name: mr.warehouse_issued_to_name || mr.issued_to_name || "", id_no: mr.warehouse_issued_to_id || mr.issued_to_id || "", signature: mr.issued_to_signature || "" },
  ];

  return (
    <div>
      {/* Stage tracker */}
      <MRStageTracker status={mr.status} />

      {/* SC warehouse comment */}
      {mr.warehouse_collection_comment && (
        <div style={v.scComment}>
          <strong>Supply Chain Note:</strong> {mr.warehouse_collection_comment}
        </div>
      )}

      {/* Tabs */}
      <div style={v.tabs}>
        <button style={{ ...v.tab, ...(activeTab === "form" ? v.tabActive : {}) }} onClick={() => setActiveTab("form")}>
          Complete Form
        </button>
        <button style={{ ...v.tab, ...(activeTab === "docs" ? v.tabActive : {}) }} onClick={() => setActiveTab("docs")}>
          Supporting Documents {mr.document_s3_keys?.length > 0 ? `(${mr.document_s3_keys.length})` : ""}
        </button>
        {showDownload && (
          <button style={v.dlBtn} onClick={onDownloadPDF}>⬇ Download PDF</button>
        )}
      </div>

      {/* Form tab */}
      {activeTab === "form" && (
        <div style={v.formWrap}>
          <div style={v.formHeader}>
            <GoltensLogo size="md" />
            <div style={v.titleArea}>
              <div style={v.formTitle}>MATERIAL REQUISITION / STORE ISSUE</div>
              <div style={v.mrNoRow}>
                <span style={v.mrNoLabel}>No.</span>
                <span style={v.mrNo}>{mr.mr_id}</span>
              </div>
            </div>
          </div>

          <div style={v.metaGrid}>
            {[
              ["Vessel",         mr.vessel],
              ["Department",     mr.department || "—"],
              ["Job No.",        mr.job_no],
              ["Date Requested", mr.date_requested],
              ["Date Required",  mr.date_required],
              ["Status",         mr.status?.replace(/_/g, " ")],
            ].map(([k, val]) => (
              <div key={k} style={v.metaCell}>
                <div style={v.metaLabel}>{k}</div>
                <div style={v.metaValue}>{val || "—"}</div>
              </div>
            ))}
          </div>

          <div style={{ overflowX: "auto", marginBottom: 20 }}>
            <table style={v.table}>
              <thead>
                <tr>{["S.N.","Item Code","Description","Qty.","U.O.M","Activity Code","Est. Cost (AED)","Budgeted"].map(h => <th key={h} style={v.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {(mr.items || []).map((it, idx) => (
                  <tr key={idx} style={idx % 2 === 0 ? { background: G.white } : { background: G.pale }}>
                    <td style={{ ...v.td, textAlign: "center" }}>{it.sn || idx + 1}</td>
                    <td style={v.td}>{it.item_code}</td>
                    <td style={v.td}>{it.description}</td>
                    <td style={v.td}>{it.qty}</td>
                    <td style={v.td}>{it.uom}</td>
                    <td style={v.td}>{it.activity_code}</td>
                    <td style={v.td}>{parseFloat(it.estimated_cost || 0).toLocaleString("en-AE", { minimumFractionDigits: 2 })}</td>
                    <td style={v.td}>{it.budgeted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={v.totalRow}>
              <span style={v.totalLabel}>Total Estimated Cost:</span>
              <span style={v.totalValue}>AED {parseFloat(mr.total_cost || 0).toLocaleString("en-AE", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div style={v.sigGrid}>
            {signatories.map(sig => (
              <div key={sig.title} style={v.sigBox}>
                <div style={v.sigTitle}>{sig.title}</div>
                <div style={v.sigField}><span style={v.sigLabel}>Name</span><span style={v.sigValue}>{sig.name || "—"}</span></div>
                <div style={v.sigField}><span style={v.sigLabel}>Signature</span><span style={v.sigValue}>{sig.signature || "—"}</span></div>
                <div style={v.sigField}><span style={v.sigLabel}>ID No.</span><span style={v.sigValue}>{sig.id_no || "—"}</span></div>
              </div>
            ))}
          </div>

          {mr.rejection_reason  && <div style={v.rejectionNote}><strong>Rejection Reason:</strong> {mr.rejection_reason}</div>}
          {mr.inprocess_note    && <div style={v.inprocessNote}><strong>In Process Note:</strong> {mr.inprocess_note}</div>}
          {mr.warehouse_collection_comment && <div style={v.warehouseNote}><strong>Supply Chain Note:</strong> {mr.warehouse_collection_comment}</div>}

          <div style={v.copyNote}>
            White — Accounts &nbsp;|&nbsp; Yellow — Purchase &nbsp;|&nbsp; Blue — Originator
            &nbsp;·&nbsp; Item issued by supply chain &nbsp;·&nbsp; FO-552-0201, Rev.06 (Jan 18)
          </div>
        </div>
      )}

      {/* Docs tab */}
      {activeTab === "docs" && <DocSection mrId={mr.mr_id} />}
    </div>
  );
}

/* ── Modal / Doc styles ── */
const dv = {
  overlay:      { position:"fixed", inset:0, background:"rgba(0,0,0,0.80)", zIndex:99999, display:"flex", alignItems:"center", justifyContent:"center" },
  modal:        { background:"#fff", borderRadius:10, width:"90vw", maxWidth:1000, maxHeight:"94vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 8px 48px rgba(0,0,0,0.4)" },
  modalHeader:  { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px", borderBottom:"1px solid #eee", flexShrink:0, background:G.pale },
  modalTitle:   { fontWeight:700, fontSize:14, color:G.navy, flex:1, marginRight:16, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  dlBtn:        { background:G.primary, color:"#fff", border:"none", borderRadius:4, padding:"6px 14px", fontSize:12, cursor:"pointer", fontWeight:600 },
  closeBtn:     { background:"#f0f0f0", border:"1px solid #ddd", borderRadius:4, padding:"6px 14px", fontSize:12, cursor:"pointer" },
  modalBody:    { flex:1, overflow:"auto", display:"flex", alignItems:"center", justifyContent:"center", minHeight:300, background:"#f8f8f8" },
  loadingState: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40 },
  spinner:      { width:40, height:40, border:`4px solid ${G.pale}`, borderTop:`4px solid ${G.primary}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" },
  errorState:   { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40, textAlign:"center" },
  openLink:     { color:G.primary, fontSize:13, textDecoration:"underline" },
  previewImg:   { maxWidth:"100%", maxHeight:"85vh", objectFit:"contain", borderRadius:4 },
  previewFrame: { width:"100%", height:"82vh", border:"none" },
  noPreview:    { textAlign:"center", padding:40 },
  dlLinkLg:     { background:G.primary, color:"#fff", border:"none", borderRadius:5, padding:"10px 28px", fontSize:13, fontWeight:600, cursor:"pointer" },
  statusMsg:    { color:G.muted, padding:"14px 0", fontSize:13 },
  grid:         { display:"flex", flexWrap:"wrap", gap:14 },
  card:         { width:150, border:`1px solid ${G.paleBorder}`, borderRadius:8, background:G.pale, display:"flex", flexDirection:"column", alignItems:"center", padding:10 },
  thumbArea:    { cursor:"pointer", marginBottom:8, width:"100%", height:90, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", borderRadius:4, background:"#e8ecf0" },
  thumb:        { width:"100%", height:"100%", objectFit:"cover" },
  fileIcon:     { fontSize:44 },
  docName:      { fontSize:11, color:"#333", fontWeight:600, textAlign:"center", marginBottom:8, wordBreak:"break-all", maxWidth:130 },
  docBtns:      { display:"flex", gap:6 },
  viewBtn:      { background:G.primary, color:"#fff", border:"none", borderRadius:4, padding:"4px 10px", fontSize:11, cursor:"pointer" },
  dlBtn2:       { background:G.pale, color:G.primary, border:`1px solid ${G.paleBorder}`, borderRadius:4, padding:"4px 8px", fontSize:12, cursor:"pointer" },
};

/* ── Form view styles ── */
const v = {
  tabs:          { display:"flex", borderBottom:`2px solid ${G.paleBorder}`, marginBottom:16, alignItems:"center" },
  tab:           { background:"none", border:"none", padding:"8px 18px", fontSize:13, cursor:"pointer", color:G.muted, fontWeight:600, borderBottom:"2px solid transparent", marginBottom:-2 },
  tabActive:     { color:G.navy, borderBottom:`2px solid ${G.primary}` },
  dlBtn:         { background:G.primary, color:"#fff", border:"none", borderRadius:5, padding:"6px 16px", fontSize:12, fontWeight:600, cursor:"pointer", marginLeft:"auto" },
  scComment:     { background:"#e8f5e9", border:"1px solid #a5d6a7", borderRadius:6, padding:"10px 14px", fontSize:13, color:"#1a7a4a", marginBottom:12 },
  formWrap:      { background:G.white, border:`1px solid ${G.paleBorder}`, borderRadius:8, padding:"20px 24px" },
  formHeader:    { display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`2.5px solid ${G.primary}`, paddingBottom:14, marginBottom:16 },
  titleArea:     { textAlign:"right" },
  formTitle:     { fontWeight:700, fontSize:14, color:G.navy, textTransform:"uppercase", letterSpacing:1 },
  mrNoRow:       { marginTop:4, display:"flex", alignItems:"baseline", gap:8, justifyContent:"flex-end" },
  mrNoLabel:     { fontSize:11, color:G.muted },
  mrNo:          { fontSize:20, fontWeight:800, color:"#c0392b", letterSpacing:2 },
  metaGrid:      { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"10px 20px", marginBottom:16 },
  metaCell:      {},
  metaLabel:     { fontSize:10, fontWeight:700, color:G.muted, textTransform:"uppercase", marginBottom:3 },
  metaValue:     { fontSize:13, fontWeight:600, color:G.navy },
  table:         { width:"100%", borderCollapse:"collapse", fontSize:12 },
  th:            { background:G.navy, color:"#fff", padding:"8px 10px", textAlign:"left", fontWeight:600, fontSize:11, whiteSpace:"nowrap" },
  td:            { padding:"6px 10px", borderBottom:`1px solid ${G.paleBorder}` },
  totalRow:      { display:"flex", justifyContent:"flex-end", alignItems:"center", gap:12, marginTop:8 },
  totalLabel:    { fontWeight:600, color:G.muted, fontSize:13 },
  totalValue:    { fontWeight:800, fontSize:16, color:G.primary },
  sigGrid:       { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12, borderTop:`1px solid ${G.paleBorder}`, paddingTop:14 },
  sigBox:        { border:`1px solid ${G.paleBorder}`, borderRadius:6, padding:"10px 12px", background:G.pale },
  sigTitle:      { fontWeight:700, color:G.navy, fontSize:12, marginBottom:8, paddingBottom:4, borderBottom:`1px solid ${G.paleBorder}` },
  sigField:      { marginBottom:5 },
  sigLabel:      { fontSize:10, color:G.muted, display:"block" },
  sigValue:      { fontSize:12, fontWeight:600, color:G.navy },
  rejectionNote: { background:"#fff5f5", border:"1px solid #f5c6c6", borderRadius:5, padding:"8px 12px", fontSize:12, color:"#c0392b", marginBottom:8 },
  inprocessNote: { background:"#fff8e1", border:"1px solid #ffe082", borderRadius:5, padding:"8px 12px", fontSize:12, color:"#b8860b", marginBottom:8 },
  warehouseNote: { background:"#e8f5e9", border:"1px solid #a5d6a7", borderRadius:5, padding:"8px 12px", fontSize:12, color:"#1a7a4a", marginBottom:8 },
  copyNote:      { fontSize:10, color:G.muted, borderTop:`1px solid ${G.paleBorder}`, paddingTop:8, marginTop:8 },
};
