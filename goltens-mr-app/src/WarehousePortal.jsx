import { useState, useEffect } from "react";
import { listMRs } from "./api";
import MRDetailView from "./MRDetailView";
import GoltensLogo from "./GoltensLogo";
import { G } from "./theme";
import SearchBar from "./SearchBar";
import NotificationBell from "./NotificationBell";
import FormTypeFilter, { filterByFormType } from "./FormTypeFilter";
import HelpChatbot from "./HelpChatbot";
import { downloadMRWithDocs } from "./downloadPDF";

async function call(action, data={}) {
  const endpoint = import.meta.env.VITE_API_ENDPOINT || "/invoke";
  const token = (() => {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith("oidc.user:"));
      for (const k of keys) {
        const parsed = JSON.parse(localStorage.getItem(k) || "{}");
        if (parsed.id_token) return parsed.id_token;
      }
    } catch(e) {}
    return "";
  })();
  const headers = {"Content-Type":"application/json"};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(endpoint,{method:"POST",headers,body:JSON.stringify({action,data})});
  if(!res.ok) throw new Error(`${res.status}`);
  const result = await res.json();
  if (result && typeof result.body === "string") { try { return JSON.parse(result.body); } catch { return result; } }
  return result;
}

export default function WarehousePortal({ session, onLogout }) {
  const [mrs, setMrs]           = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [formFilter, setFormFilter] = useState("all");

  // Issued by (warehouse person — pre-filled from session)
  const [issuedByName, setIssuedByName] = useState(session?.name || "");
  const [issuedById,   setIssuedById]   = useState(session?.id_no || "");

  // Warehouse note — filled by warehouse person only
  const [warehouseNote, setWarehouseNote] = useState("");

  // Issued to (recipient)
  const [issuedToName, setIssuedToName] = useState("");
  const [issuedToId,   setIssuedToId]   = useState("");

  const [actionMsg,  setActionMsg]  = useState("");
  const [actioning,  setActioning]  = useState(false);

  const loadMRs = async () => {
    try {
      const all = await listMRs("ALL");
      setMrs((all||[]).filter(m => ["APPROVED","IN_PROCESS","ISSUED"].includes(m.status)));
    } catch(e){ console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    if(session?.email){ loadMRs();
    const t = setInterval(loadMRs, 120000);
    return () => clearInterval(t); }
  }, [session?.email]);

  // Auto-select first MR when data loads
  useEffect(() => {
    if (mrs.length > 0 && !selected) {
      openMR(mrs[0]);
    }
  }, [mrs]);

  const filteredMRs = filterByFormType(mrs, formFilter);

  const openMR = (mr) => {
    setSelected(mr);
    setActionMsg("");
    setIssuedByName(session?.name || "");
    setIssuedById(session?.id_no || "");
    setWarehouseNote(mr.warehouse_issue_note || "");
    setIssuedToName(mr.warehouse_issued_to_name || "");
    setIssuedToId(mr.warehouse_issued_to_id || "");
  };

  const handleIssue = async () => {
    if (!issuedToName.trim()) { setActionMsg("Please enter the name of the recipient."); return; }
    setActioning(true);
    const r = await call("warehouse_issue_mr", {
      mr_id:                    selected.mr_id,
      issued_by:                issuedByName || session?.name || session?.email,
      warehouse_issued_to_name: issuedToName,
      warehouse_issued_to_id:   issuedToId,
      warehouse_issue_note:     warehouseNote,
    });
    if (r?.success !== false) {
      setActionMsg("✓ Items issued successfully. All parties notified.");
      loadMRs();
      setSelected(p => ({
        ...p,
        status:                   "ISSUED",
        warehouse_issued_to_name: issuedToName,
        warehouse_issued_to_id:   issuedToId,
        warehouse_issue_note:     warehouseNote,
      }));
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
          <div style={s.topActions}>
            <button style={s.refreshBtn} onClick={loadMRs}>↻ Refresh</button>
            <button style={s.logoutBtn} onClick={onLogout}>Log Out</button>
          </div>

          <div style={{padding:"6px 12px"}}>
            <FormTypeFilter mrs={mrs} selected={formFilter} onChange={setFormFilter} accentColor="rgba(255,255,255,0.9)" compact/>
          </div>

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

          
        </div>

        {/* Main */}
        <div style={s.main}>
          <div style={s.topBar}>
            <SearchBar mrs={mrs} onSelect={mr=>openMR(mr)} placeholder="Search MR, vessel, job…"/>
            <NotificationBell mrs={mrs} role="warehouse" userEmail={session.email} accentColor="#5d4037"
              onNavigate={mr=>{ openMR(mr); setTimeout(()=>window.scrollTo(0,0),100); }}/>
          </div>
          {!selected ? (
            <div style={s.emptyState}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🏭</div>
              <div style={{ fontSize: 14, color: "#aaa" }}>Select an MR from the queue to process</div>
            </div>
          ) : (
            <div>
              <MRDetailView
                mr={selected}
                showDownload
                onDownloadPDF={() => downloadMRWithDocs(selected)}
              />

              {/* Issue panel */}
              <div style={s.issuePanel}>
                <div style={s.issueTitle}>Item Issuance Details</div>

                {/* Issued By — warehouse person */}
                <div style={s.subSection}>
                  <div style={s.subSectionLabel}>Issued By (Warehouse Person)</div>
                  <div style={s.twoCol}>
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
                  </div>

                  {/* Warehouse Note — filled by warehouse person */}
                  <div style={{ marginTop: 10 }}>
                    <label style={s.label}>
                      Warehouse Note
                      <span style={{ fontWeight:400, color:"#999", fontSize:11, marginLeft:6 }}>
                        (visible to User, Manager, HOD and Supply Chain)
                      </span>
                    </label>
                    <textarea
                      style={{ ...s.input, resize:"vertical", minHeight:64, paddingTop:8, fontFamily:"inherit" }}
                      placeholder="e.g. Items collected from Rack B-12. Partial quantity issued — remaining 2 pcs on back order."
                      value={warehouseNote}
                      onChange={e => setWarehouseNote(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>

                <div style={s.divider} />

                {/* Issued To — recipient */}
                <div style={s.subSection}>
                  <div style={s.subSectionLabel}>Items Issued To (Recipient) *</div>
                  <div style={s.twoCol}>
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
  page:            { minHeight:"100vh", background:"#f0f2f5", fontFamily:"'Inter','Segoe UI',system-ui,Arial,sans-serif", fontSize:13 },
  shell:           { display:"flex", minHeight:"100vh" },
  sidebar:         { width:260, background:"#5d4037", color:"#fff", display:"flex", flexDirection:"column", padding:"0 0 16px", flexShrink:0 },
  sideHeader:      { padding:"20px 20px 8px", borderBottom:"1px solid rgba(255,255,255,0.15)" },
  portalLabel:     { fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.7)", letterSpacing:1, textTransform:"uppercase", padding:"8px 20px 12px" },
  sideSection:     { fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.45)", letterSpacing:1.5, padding:"10px 20px 6px" },
  sideLoading:     { fontSize:11, color:"rgba(255,255,255,0.4)", padding:"8px 20px" },
  mrCard:          { margin:"2px 12px", padding:"10px 12px", borderRadius:6, cursor:"pointer" },
  mrCardActive:    { background:"rgba(255,255,255,0.15)" },
  mrCardId:        { fontWeight:700, fontSize:12, color:"#fff" },
  mrCardMeta:      { fontSize:11, color:"rgba(255,255,255,0.65)", marginTop:3 },
  badge:           { display:"inline-block", marginTop:5, fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10 },
  sideFooter:      { marginTop:"auto", padding:"16px 20px 0", borderTop:"1px solid rgba(255,255,255,0.1)", display:"flex", flexDirection:"column", gap:8 },
  pendingNote:     { fontSize:11, color:"rgba(255,255,255,0.5)" },
  refreshBtn:      { background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", borderRadius:4, padding:"6px 14px", fontSize:12, cursor:"pointer" },
  logoutBtn:       { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.15)", color:"#fff", borderRadius:4, padding:"6px 14px", fontSize:12, cursor:"pointer" },
  topBar:          { display:"flex", alignItems:"center", gap:10, marginBottom:20, padding:"4px 0", justifyContent:"space-between" },
  main:            { flex:1, padding:"28px 32px", overflowY:"auto" },
  emptyState:      { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"60vh" },
  issuePanel:      { background:"#fafbfc", border:`1px solid ${G.paleBorder}`, borderRadius:8, padding:"20px 24px", marginTop:16 },
  issueTitle:      { fontWeight:700, fontSize:13, color:"#5d4037", marginBottom:16, textTransform:"uppercase", letterSpacing:0.5, paddingBottom:10, borderBottom:`1px solid ${G.paleBorder}` },
  subSection:      { marginBottom:16 },
  subSectionLabel: { fontWeight:600, fontSize:12, color:"#5d4037", marginBottom:10 },
  divider:         { borderTop:`1px dashed ${G.paleBorder}`, margin:"16px 0" },
  twoCol:          { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
  threeCol:        { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 },
  label:           { display:"block", fontSize:12, fontWeight:600, color:"#333", marginBottom:4 },
  input:           { width:"100%", border:`1px solid ${G.paleBorder}`, borderRadius:4, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box" },
  issueBtn:        { background:"#5d4037", color:"#fff", border:"none", borderRadius:5, padding:"10px 28px", fontSize:13, fontWeight:700, cursor:"pointer", marginTop:4 },
  actionMsg:       { marginTop:10, border:"1px solid", borderRadius:5, padding:"8px 12px", fontSize:12 },
};