import { useState, useEffect } from "react";
import { listMRs } from "./api";
import MRDetailView from "./MRDetailView";
import GoltensLogo from "./GoltensLogo";
import { G } from "./theme";
import FormTypeFilter, { filterByFormType } from "./FormTypeFilter";
import HelpChatbot from "./HelpChatbot";

async function call(action, data={}) {
  const res = await fetch("/invoke",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,data})});
  if(!res.ok) throw new Error(`${res.status}`); return res.json();
}

function downloadMRPDF(mr) {
  const win = window.open("","_blank");
  win.document.write(`<html><head><title>MR ${mr.mr_id}</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}
  h2{color:#5d4037}table{width:100%;border-collapse:collapse}
  th{background:#5d4037;color:#fff;padding:6px 8px;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #eee}
  .sig-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px;border-top:1px solid #ccc;padding-top:12px}
  .sig-box{border:1px solid #ccc;padding:8px;border-radius:4px}
  .sig-title{font-weight:bold;margin-bottom:6px;font-size:11px;color:#5d4037}
  </style></head><body>
  <h2>Goltens Co. Ltd. Dubai Branch</h2>
  <h3>Material Requisition — ${mr.mr_id}</h3>
  <p><b>Vessel:</b> ${mr.vessel} &nbsp; <b>Dept:</b> ${mr.department||"—"} &nbsp; <b>Job:</b> ${mr.job_no} &nbsp; <b>Status:</b> ${mr.status?.replace(/_/g," ")}</p>
  <table><thead><tr><th>S.N.</th><th>Item Code</th><th>Description</th><th>Qty</th><th>UOM</th><th>Activity Code</th><th>Est. Cost</th><th>Budgeted</th></tr></thead>
  <tbody>${(mr.items||[]).map((it,i)=>`<tr><td>${i+1}</td><td>${it.item_code||""}</td><td>${it.description||""}</td><td>${it.qty||""}</td><td>${it.uom||""}</td><td>${it.activity_code||""}</td><td>${it.estimated_cost||""}</td><td>${it.budgeted||""}</td></tr>`).join("")}</tbody></table>
  <p><b>Total: AED ${parseFloat(mr.total_cost||0).toLocaleString("en-AE",{minimumFractionDigits:2})}</b></p>
  ${mr.warehouse_collection_comment?`<p style="background:#e8f5e9;padding:8px;border-radius:4px"><b>Supply Chain Note:</b> ${mr.warehouse_collection_comment}</p>`:""}
  <div class="sig-grid">
    <div class="sig-box"><div class="sig-title">Requested By</div>${mr.submitted_by_name||"—"}</div>
    <div class="sig-box"><div class="sig-title">Approved By</div>${mr.hod_approved_by||mr.approved_by||"—"}</div>
    <div class="sig-box"><div class="sig-title">MR Received By</div>${mr.sc_received_by_name||"—"}</div>
    <div class="sig-box"><div class="sig-title">Items Issued To</div>${mr.warehouse_issued_to_name||"—"}</div>
  </div>
  </body></html>`);
  win.document.close(); win.print();
}

export default function WarehousePortal({ session, onLogout }) {
  const [mrs, setMrs]           = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);

  // Warehouse person (who is issuing)
  const [issuedByName, setIssuedByName] = useState(session?.name || "");
  const [issuedById,   setIssuedById]   = useState(session?.id_no || "");
  const [issuedBySig,  setIssuedBySig]  = useState("");

  // Issued to (recipient)
  const [issuedToName, setIssuedToName] = useState("");
  const [issuedToId,   setIssuedToId]   = useState("");
  const [issuedToSig,  setIssuedToSig]  = useState("");

  const [actionMsg,  setActionMsg]  = useState("");
  const [actioning,  setActioning]  = useState(false);
  const [formFilter, setFormFilter] = useState("all");

  const loadMRs = async () => {
    try {
      const all = await listMRs("ALL");
      setMrs((all||[]).filter(m => ["APPROVED","IN_PROCESS","ISSUED"].includes(m.status)));
    } catch(e){ console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    loadMRs();
    const t = setInterval(loadMRs, 30000);
    return () => clearInterval(t);
  }, []);

  const filteredMRs = filterByFormType(mrs, formFilter);
  const openMR = (mr) => {
    setSelected(mr);
    setActionMsg("");
    // Pre-fill issued by from session
    setIssuedByName(session?.name || "");
    setIssuedById(session?.id_no || "");
    setIssuedBySig("");
    // Pre-fill issued to if already filled
    setIssuedToName(mr.warehouse_issued_to_name || "");
    setIssuedToId(mr.warehouse_issued_to_id || "");
    setIssuedToSig(mr.issued_to_signature || "");
  };

  const handleIssue = async () => {
    if (!issuedToName.trim()) { setActionMsg("Please enter the name of the recipient."); return; }
    setActioning(true);
    const r = await call("warehouse_issue_mr", {
      mr_id: selected.mr_id,
      issued_by: issuedByName || session?.name || session?.email,
      warehouse_issued_to_name: issuedToName,
      warehouse_issued_to_id:   issuedToId,
      issued_to_signature:      issuedToSig,
    });
    if (r?.success !== false) {
      setActionMsg("✓ Items issued successfully. Record updated.");
      loadMRs();
      setSelected(p => ({ ...p, status:"ISSUED", warehouse_issued_to_name:issuedToName, warehouse_issued_to_id:issuedToId }));
    } else {
      setActionMsg("Error: " + (r?.error || "Unknown error"));
    }
    setActioning(false);
  };

  const pendingCount = filteredMRs.filter(m => m.status !== "ISSUED").length;

  return (
    <div style={s.page}>
      <div style={s.shell}>
        {/* Sidebar */}
        <div style={s.sidebar}>
          <div style={s.sideHeader}>
            <GoltensLogo size="sm" dark style={{ flexShrink: 0 }} />
          </div>
          <div style={s.portalLabel}>Warehouse Portal</div>

          <div style={{padding:"6px 12px"}}><FormTypeFilter mrs={mrs} selected={formFilter} onChange={setFormFilter} accentColor="rgba(255,255,255,0.9)" compact/></div>
          <div style={s.sideSection}>MR QUEUE</div>
          {loading && <div style={s.sideLoading}>Loading…</div>}
          {!loading && filteredMRs.length === 0 && <div style={s.sideLoading}>No MRs assigned.</div>}
          {filteredMRs.map(mr => (
            <div key={mr.mr_id}
              style={{ ...s.mrCard, ...(selected?.mr_id === mr.mr_id ? s.mrCardActive : {}) }}
              onClick={() => openMR(mr)}>
              <div style={s.mrCardId}>{mr.mr_id}</div>
              <div style={s.mrCardMeta}>{mr.vessel} · {mr.submitted_by_name}</div>
              <div style={{
                ...s.badge,
                background: mr.status === "ISSUED" ? "rgba(50,200,100,0.2)" : "rgba(255,165,0,0.2)",
                color:       mr.status === "ISSUED" ? "#2ecc71"               : "#ffa500",
              }}>
                {mr.status?.replace("_", " ")}
              </div>
            </div>
          ))}

          <div style={s.sideFooter}>
            <div style={s.pendingNote}>{pendingCount} pending issuance</div>
            <button style={s.refreshBtn} onClick={loadMRs}>↻ Refresh</button>
            <button style={s.logoutBtn} onClick={onLogout}>Log Out</button>
          </div>
        </div>

        {/* Main */}
        <div style={s.main}>
          {!selected ? (
            <div style={s.emptyState}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🏭</div>
              <div style={{ fontSize: 14, color: "#aaa" }}>Select an MR from the queue to process</div>
            </div>
          ) : (
            <div>
              <MRDetailView mr={selected} showDownload onDownloadPDF={() => downloadMRPDF(selected)} />

              {/* Issue panel */}
              <div style={s.issuePanel}>
                <div style={s.issueTitle}>Item Issuance Details</div>

                {/* ── WAREHOUSE PERSON (who is issuing) — shown ABOVE issued-to ── */}
                <div style={s.subSection}>
                  <div style={s.subSectionLabel}>Issued By (Warehouse Person)</div>
                  <div style={s.threeCol}>
                    <div>
                      <label style={s.label}>Name</label>
                      <input style={s.input} placeholder="Warehouse staff name"
                        value={issuedByName} onChange={e => setIssuedByName(e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>ID No.</label>
                      <input style={s.input} placeholder="Staff ID"
                        value={issuedById} onChange={e => setIssuedById(e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>Signature</label>
                      <input style={s.input} placeholder="Signature"
                        value={issuedBySig} onChange={e => setIssuedBySig(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div style={s.divider} />

                {/* ── ISSUED TO (recipient) ── */}
                <div style={s.subSection}>
                  <div style={s.subSectionLabel}>Items Issued To (Recipient) *</div>
                  <div style={s.threeCol}>
                    <div>
                      <label style={s.label}>Name *</label>
                      <input style={s.input} placeholder="Recipient name"
                        value={issuedToName} onChange={e => setIssuedToName(e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>ID No.</label>
                      <input style={s.input} placeholder="Recipient ID"
                        value={issuedToId} onChange={e => setIssuedToId(e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>Signature</label>
                      <input style={s.input} placeholder="Signature"
                        value={issuedToSig} onChange={e => setIssuedToSig(e.target.value)} />
                    </div>
                  </div>
                </div>

                <button
                  style={{ ...s.issueBtn, ...(actioning || selected.status === "ISSUED" ? { opacity: 0.7 } : {}) }}
                  onClick={handleIssue}
                  disabled={actioning || selected.status === "ISSUED"}>
                  {selected.status === "ISSUED" ? "✓ Already Issued" : "✓ Confirm Item Issuance"}
                </button>

                {actionMsg && (
                  <div style={{
                    ...s.actionMsg,
                    background: actionMsg.startsWith("Error") ? G.dangerBg : "#e8f5e9",
                    borderColor: actionMsg.startsWith("Error") ? "#f5c6c6" : "#a5d6a7",
                    color:       actionMsg.startsWith("Error") ? G.danger   : "#1a7a4a",
                  }}>
                    {actionMsg}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <HelpChatbot role="warehouse" userName={session?.name} userEmail={session?.email} />
    </div>
  );
}

const s = {
  page:        { minHeight:"100vh", background:"#f0f2f5", fontFamily:"'Segoe UI',Arial,sans-serif", fontSize:13 },
  shell:       { display:"flex", minHeight:"100vh" },
  sidebar:     { width:260, background:"#5d4037", color:"#fff", display:"flex", flexDirection:"column", padding:"0 0 16px", flexShrink:0 },
  sideHeader:  { padding:"20px 20px 8px", borderBottom:"1px solid rgba(255,255,255,0.15)" },
  portalLabel: { fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.7)", letterSpacing:1, textTransform:"uppercase", padding:"8px 20px 12px" },
  sideSection: { fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.45)", letterSpacing:1.5, padding:"10px 20px 6px" },
  sideLoading: { fontSize:11, color:"rgba(255,255,255,0.4)", padding:"8px 20px" },
  mrCard:      { margin:"2px 12px", padding:"10px 12px", borderRadius:6, cursor:"pointer" },
  mrCardActive:{ background:"rgba(255,255,255,0.15)" },
  mrCardId:    { fontWeight:700, fontSize:12, color:"#fff" },
  mrCardMeta:  { fontSize:11, color:"rgba(255,255,255,0.65)", marginTop:3 },
  badge:       { display:"inline-block", marginTop:5, fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10 },
  sideFooter:  { marginTop:"auto", padding:"16px 20px 0", borderTop:"1px solid rgba(255,255,255,0.1)", display:"flex", flexDirection:"column", gap:8 },
  pendingNote: { fontSize:11, color:"rgba(255,255,255,0.5)" },
  refreshBtn:  { background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", borderRadius:4, padding:"6px 14px", fontSize:12, cursor:"pointer" },
  logoutBtn:   { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.15)", color:"#fff", borderRadius:4, padding:"6px 14px", fontSize:12, cursor:"pointer" },
  main:        { flex:1, padding:"28px 32px", overflowY:"auto" },
  emptyState:  { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"60vh" },
  issuePanel:  { background:"#fafbfc", border:`1px solid ${G.paleBorder}`, borderRadius:8, padding:"20px 24px", marginTop:16 },
  issueTitle:  { fontWeight:700, fontSize:13, color:"#333", marginBottom:16, textTransform:"uppercase", letterSpacing:0.5, paddingBottom:10, borderBottom:`1px solid ${G.paleBorder}` },
  subSection:  { marginBottom:16 },
  subSectionLabel: { fontWeight:600, fontSize:12, color:"#5d4037", marginBottom:10, display:"flex", alignItems:"center", gap:6 },
  divider:     { borderTop:`1px dashed ${G.paleBorder}`, margin:"16px 0" },
  threeCol:    { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 },
  label:       { display:"block", fontSize:12, fontWeight:600, color:"#333", marginBottom:4 },
  input:       { width:"100%", border:`1px solid ${G.paleBorder}`, borderRadius:4, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box" },
  issueBtn:    { background:"#5d4037", color:"#fff", border:"none", borderRadius:5, padding:"10px 28px", fontSize:13, fontWeight:700, cursor:"pointer", marginTop:4 },
  actionMsg:   { marginTop:10, border:"1px solid", borderRadius:5, padding:"8px 12px", fontSize:12 },
};
