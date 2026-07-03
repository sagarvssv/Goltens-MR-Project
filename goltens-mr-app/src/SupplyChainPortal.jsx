import { useState, useEffect, useCallback } from "react";
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
  h2{color:#1A3A5C}table{width:100%;border-collapse:collapse}
  th{background:#0d6b4e;color:#fff;padding:6px 8px;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #eee}
  .sig-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px;border-top:1px solid #ccc;padding-top:12px}
  .sig-box{border:1px solid #ccc;padding:8px;border-radius:4px}
  .sig-title{font-weight:bold;margin-bottom:6px;font-size:11px;color:#0d6b4e}
  </style></head><body>
  <h2>Goltens Co. Ltd. Dubai Branch</h2>
  <h3>Material Requisition — ${mr.mr_id}</h3>
  <p><b>Vessel:</b> ${mr.vessel} &nbsp; <b>Dept:</b> ${mr.department||"—"} &nbsp; <b>Job:</b> ${mr.job_no} &nbsp; <b>Status:</b> ${mr.status?.replace(/_/g," ")}</p>
  <table><thead><tr><th>S.N.</th><th>Item Code</th><th>Description</th><th>Qty</th><th>UOM</th><th>Activity Code</th><th>Est. Cost</th><th>Budgeted</th></tr></thead>
  <tbody>${(mr.items||[]).map((it,i)=>`<tr><td>${i+1}</td><td>${it.item_code}</td><td>${it.description}</td><td>${it.qty}</td><td>${it.uom}</td><td>${it.activity_code}</td><td>${it.estimated_cost}</td><td>${it.budgeted}</td></tr>`).join("")}</tbody></table>
  <p><b>Total: AED ${parseFloat(mr.total_cost||0).toLocaleString("en-AE",{minimumFractionDigits:2})}</b></p>
  ${mr.warehouse_collection_comment?`<p style="background:#e8f5e9;padding:8px"><b>Warehouse Note:</b> ${mr.warehouse_collection_comment}</p>`:""}
  <div class="sig-grid">
    <div class="sig-box"><div class="sig-title">Requested By</div>${mr.submitted_by_name||"—"}</div>
    <div class="sig-box"><div class="sig-title">Approved By</div>${mr.approved_by||mr.hod_approved_by||"—"}</div>
    <div class="sig-box"><div class="sig-title">MR Received By</div>${mr.sc_received_by_name||"—"}</div>
    <div class="sig-box"><div class="sig-title">Items Issued To</div>${mr.warehouse_issued_to_name||"—"}</div>
  </div></body></html>`);
  win.document.close(); win.print();
}

export default function SupplyChainPortal({ session, onLogout }) {
  const [mrs, setMrs]           = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [view, setView]         = useState("queue");

  // SC receive form
  const [scName, setScName]     = useState(session?.name || "");
  const [scId,   setScId]       = useState(session?.id_no || "");
  const [scSig,  setScSig]      = useState("");
  const [whComment, setWhComment] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [actioning, setActioning] = useState(false);

  const loadMRs = async () => {
    try {
      const all = await listMRs("ALL");
      setMrs((all||[]).filter(m => ["APPROVED","IN_PROCESS","ISSUED"].includes(m.status)));
    } catch(e){console.error(e);}
    setLoading(false);
  };

  useEffect(()=>{ loadMRs(); const t=setInterval(loadMRs,30000); return()=>clearInterval(t); },[]);

  const [formFilter, setFormFilter] = useState("all");
  const filteredMRs = filterByFormType(mrs, formFilter);
  const openMR = (mr) => {
    setSelected(mr); setActionMsg("");
    setScName(mr.sc_received_by_name || session?.name || "");
    setScId(mr.sc_received_by_id || session?.id_no || "");
    setScSig(mr.sc_received_by_sig || "");
    setWhComment(mr.warehouse_collection_comment || "");
  };

  const handleReceive = async () => {
    setActioning(true);
    const r = await call("sc_receive_mr",{
      mr_id: selected.mr_id,
      sc_received_by_name: scName,
      sc_received_by_id: scId,
      sc_received_by_sig: scSig,
      warehouse_collection_comment: whComment,
    });
    if(r?.success!==false){
      setActionMsg("MR received confirmed. Warehouse has been notified.");
      loadMRs();
      setSelected(p=>({...p, sc_received_by_name:scName, sc_received_by_id:scId, warehouse_collection_comment:whComment}));
    } else { setActionMsg("Error: "+r?.error); }
    setActioning(false);
  };

  const handleStockUnavailable = async () => {
    setActioning(true);
    const r = await call("mark_inprocess_mr",{
      mr_id: selected.mr_id,
      actioned_by: scName || session?.name || session?.email,
      note: "Stock unavailable — items will be issued once available.",
    });
    if(r?.success!==false){ setActionMsg("Marked as In Process. User notified."); loadMRs(); }
    setActioning(false);
  };

  const pendingCount = filteredMRs.filter(m=>m.status!=="ISSUED").length;

  return (
    <div style={s.page}>
      <div style={s.shell}>
        {/* Sidebar */}
        <div style={s.sidebar}>
          <div style={s.sideHeader}>
            <GoltensLogo size="sm" dark style={{flexShrink:0}}/>
          </div>
          <div style={s.portalLabel}>Supply Chain Portal</div>
          <div style={{padding:"6px 12px"}}><FormTypeFilter mrs={mrs} selected={formFilter} onChange={setFormFilter} accentColor="rgba(255,255,255,0.9)" compact/></div>
          <div style={s.sideSection}>MR QUEUE</div>
          {loading && <div style={s.sideLoading}>Loading…</div>}
          {!loading && filteredMRs.length===0 && <div style={s.sideLoading}>No MRs assigned.</div>}
          {filteredMRs.map(mr=>(
            <div key={mr.mr_id} style={{...s.mrCard,...(selected?.mr_id===mr.mr_id?s.mrCardActive:{})}} onClick={()=>openMR(mr)}>
              <div style={s.mrCardTop}>
                <div style={s.mrCardId}>{mr.mr_id}</div>
                {mr.document_s3_keys?.length>0 && <div style={s.docBadge}>📎{mr.document_s3_keys.length}</div>}
              </div>
              <div style={s.mrCardMeta}>{mr.vessel} · {mr.submitted_by_name}</div>
              <div style={{...s.badge, background:mr.status==="ISSUED"?"rgba(50,200,100,0.2)":mr.status==="IN_PROCESS"?"rgba(255,165,0,0.2)":"rgba(255,255,255,0.15)", color:mr.status==="ISSUED"?"#2ecc71":mr.status==="IN_PROCESS"?"#ffa500":"rgba(255,255,255,0.9)"}}>
                {mr.status?.replace("_"," ")}
              </div>
            </div>
          ))}
          <div style={s.sideFooter}>
            <div style={s.pendingNote}>{pendingCount} in queue</div>
            <button style={s.refreshBtn} onClick={loadMRs}>↻ Refresh</button>
            <button style={s.logoutBtn} onClick={onLogout}>Log Out</button>
          </div>
        </div>

        {/* Main */}
        <div style={s.main}>
          {!selected ? (
            <div style={s.emptyState}>
              <div style={{fontSize:48,marginBottom:16}}>📦</div>
              <div style={{fontSize:14,color:"#aaa"}}>Select an approved MR to process</div>
            </div>
          ) : (
            <div>
              <MRDetailView mr={selected} showDownload onDownloadPDF={()=>downloadMRPDF(selected)} />

              {/* SC action panel */}
              <div style={s.actionPanel}>
                <div style={s.panelTitle}>Supply Chain Actions</div>

                {/* MR Received By */}
                <div style={s.section}>
                  <div style={s.sectionLabel}>M.R. Received By <span style={s.hint}>(auto-filled from your login)</span></div>
                  <div style={s.threeCol}>
                    <div><label style={s.label}>Name</label><input style={s.input} value={scName} onChange={e=>setScName(e.target.value)} placeholder="Name"/></div>
                    <div><label style={s.label}>ID No.</label><input style={s.input} value={scId} onChange={e=>setScId(e.target.value)} placeholder="ID number"/></div>
                    <div><label style={s.label}>Signature</label><input style={s.input} value={scSig} onChange={e=>setScSig(e.target.value)} placeholder="Signature"/></div>
                  </div>
                </div>

                {/* Warehouse collection comment */}
                <div style={s.section}>
                  <div style={s.sectionLabel}>Warehouse Collection Note <span style={s.hint}>(visible to User, Manager, HOD, and Warehouse)</span></div>
                  <textarea style={s.textarea} rows={3}
                    placeholder="e.g. Items to be collected by John from Warehouse A, Section 3..."
                    value={whComment} onChange={e=>setWhComment(e.target.value)}/>
                </div>

                <div style={s.btnRow}>
                  <button style={{...s.receiveBtn,...(actioning?{opacity:0.7}:{})}} onClick={handleReceive} disabled={actioning}>
                    ✓ Confirm MR Received
                  </button>
                  <button style={{...s.stockBtn,...(actioning?{opacity:0.7}:{})}} onClick={handleStockUnavailable} disabled={actioning}>
                    📦 Mark Stock Unavailable
                  </button>
                </div>

                {actionMsg && <div style={s.actionMsg}>{actionMsg}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
      <HelpChatbot role="supply_chain" userName={session?.name} userEmail={session?.email} />
    </div>
  );
}

const s = {
  page:{minHeight:"100vh",background:"#f0f2f5",fontFamily:"'Segoe UI',Arial,sans-serif",fontSize:13},
  shell:{display:"flex",minHeight:"100vh"},
  sidebar:{width:260,background:"#0d6b4e",color:"#fff",display:"flex",flexDirection:"column",padding:"0 0 16px",flexShrink:0},
  sideHeader:{padding:"20px 20px 8px",borderBottom:"1px solid rgba(255,255,255,0.15)"},
  portalLabel:{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.7)",letterSpacing:1,textTransform:"uppercase",padding:"8px 20px 12px"},
  sideSection:{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.45)",letterSpacing:1.5,padding:"10px 20px 6px"},
  sideLoading:{fontSize:11,color:"rgba(255,255,255,0.4)",padding:"8px 20px"},
  mrCard:{margin:"2px 12px",padding:"10px 12px",borderRadius:6,cursor:"pointer"},
  mrCardActive:{background:"rgba(255,255,255,0.15)"},
  mrCardTop:{display:"flex",justifyContent:"space-between",alignItems:"center"},
  mrCardId:{fontWeight:700,fontSize:12,color:"#fff"},
  docBadge:{fontSize:10,color:"rgba(255,255,255,0.7)",background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"1px 7px"},
  mrCardMeta:{fontSize:11,color:"rgba(255,255,255,0.65)",marginTop:3},
  badge:{display:"inline-block",marginTop:5,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10},
  sideFooter:{marginTop:"auto",padding:"16px 20px 0",borderTop:"1px solid rgba(255,255,255,0.1)",display:"flex",flexDirection:"column",gap:8},
  pendingNote:{fontSize:11,color:"rgba(255,255,255,0.5)"},
  refreshBtn:{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",borderRadius:4,padding:"6px 14px",fontSize:12,cursor:"pointer"},
  logoutBtn:{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",color:"#fff",borderRadius:4,padding:"6px 14px",fontSize:12,cursor:"pointer"},
  main:{flex:1,padding:"28px 32px",overflowY:"auto"},
  emptyState:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"60vh"},
  actionPanel:{background:"#fafbfc",border:`1px solid ${G.paleBorder}`,borderRadius:8,padding:"20px 24px",marginTop:16},
  panelTitle:{fontWeight:700,fontSize:13,color:"#333",marginBottom:14,textTransform:"uppercase",letterSpacing:0.5},
  section:{marginBottom:16},
  sectionLabel:{fontWeight:600,fontSize:12,color:"#333",marginBottom:8},
  hint:{fontWeight:400,color:G.muted,fontSize:11},
  threeCol:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12},
  label:{display:"block",fontSize:11,color:G.muted,marginBottom:3},
  input:{width:"100%",border:`1px solid ${G.paleBorder}`,borderRadius:4,padding:"7px 10px",fontSize:13,outline:"none",boxSizing:"border-box"},
  textarea:{width:"100%",border:`1px solid ${G.paleBorder}`,borderRadius:4,padding:"8px 10px",fontSize:13,resize:"vertical",outline:"none",boxSizing:"border-box"},
  btnRow:{display:"flex",gap:12,marginTop:4},
  receiveBtn:{background:"#0d6b4e",color:"#fff",border:"none",borderRadius:5,padding:"10px 24px",fontSize:13,fontWeight:700,cursor:"pointer"},
  stockBtn:{background:"#b8860b",color:"#fff",border:"none",borderRadius:5,padding:"10px 24px",fontSize:13,fontWeight:700,cursor:"pointer"},
  actionMsg:{marginTop:10,background:"#e8f5e9",border:"1px solid #a5d6a7",borderRadius:5,padding:"8px 12px",fontSize:12,color:"#1a7a4a"},
};
