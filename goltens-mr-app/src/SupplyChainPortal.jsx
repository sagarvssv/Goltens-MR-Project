import { useState, useEffect, useCallback } from "react";
import { listMRs } from "./api";
import MRDetailView from "./MRDetailView";
import GoltensLogo from "./GoltensLogo";
import { G } from "./theme";
import SearchBar from "./SearchBar";
import NotificationBell from "./NotificationBell";
import SLABadge, { getSLADays } from "./SLABadge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { downloadMRWithDocs } from "./downloadPDF";
import FormTypeFilter, { filterByFormType } from "./FormTypeFilter";
import HelpChatbot from "./HelpChatbot";

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


export default function SupplyChainPortal({ session, onLogout }) {
  const [mrs, setMrs]           = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [view, setView]         = useState("queue");

  // SC receive form
  const [scName, setScName]     = useState(session?.name || "");
  const [scId,   setScId]       = useState(session?.id_no || "");

  // Sync scName/scId when session loads (in case it wasn't ready on first render)
  useEffect(() => {
    if (session?.name  && !scName) setScName(session.name);
    if (session?.id_no && !scId)   setScId(session.id_no);
  }, [session?.name, session?.id_no]);
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

  useEffect(()=>{ if(session?.email){ loadMRs(); const t=setInterval(loadMRs,120000); return()=>clearInterval(t); } },[session?.email]);

  const [formFilter, setFormFilter] = useState("all");
  const [scPortalView, setScPortalView] = useState("analytics"); // queue | analytics
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
    // Use session values as fallback if fields are empty
    const finalName = scName || session?.name || "";
    const finalId   = scId   || session?.id_no || "";
    const r = await call("sc_receive_mr",{
      mr_id: selected.mr_id,
      sc_name: finalName,
      sc_id:   finalId,
      sc_received_by_name: finalName,
      sc_received_by_id: finalId,
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
          <div style={s.topActions}>
            <button style={s.refreshBtn} onClick={loadMRs}>↻ Refresh</button>
            <button style={s.logoutBtn} onClick={onLogout}>Log Out</button>
          </div>
          <div style={{padding:"8px 12px 4px"}}>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              <button style={{flex:1,padding:"6px",borderRadius:5,border:"none",background:scPortalView==="queue"?"#0d6b4e":"rgba(255,255,255,0.15)",color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer"}} onClick={()=>setScPortalView("queue")}>📋 Queue</button>
              <button style={{flex:1,padding:"6px",borderRadius:5,border:"none",background:scPortalView==="analytics"?"#0d6b4e":"rgba(255,255,255,0.15)",color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer"}} onClick={()=>setScPortalView("analytics")}>📊 Analytics</button>
            </div>
          </div>
          <div style={{padding:"0 12px 4px"}}><FormTypeFilter mrs={mrs} selected={formFilter} onChange={setFormFilter} accentColor="rgba(255,255,255,0.9)" compact/></div>
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
          
        </div>

        {/* Main */}
        <div style={s.main}>
          <div style={s.topBar}>
            <SearchBar mrs={mrs} onSelect={mr=>{openMR(mr);setScPortalView("queue");}} />
            <div style={{marginLeft:"auto"}}>
              <NotificationBell mrs={mrs} role="supply_chain" userEmail={session.email} accentColor="#0d6b4e"
                onNavigate={mr=>{ openMR(mr); setScPortalView("queue"); setTimeout(()=>window.scrollTo(0,0),100); }}/>
            </div>
          </div>
          {scPortalView==="analytics" && (
            <div>
              <div style={{fontWeight:700,fontSize:18,color:"#0d6b4e",marginBottom:20,paddingBottom:12,borderBottom:"2px solid #0d6b4e"}}>Supply Chain Analytics</div>
              <SCAnalytics mrs={filteredMRs}/>
            </div>
          )}
          {scPortalView==="queue" && !selected && (
            <div style={s.emptyState}>
              <div style={{fontSize:48,marginBottom:16}}>📦</div>
              <div style={{fontSize:14,color:"#aaa"}}>Select an approved MR to process</div>
            </div>
          )}
          {scPortalView==="queue" && selected && (
            <div>
              <MRDetailView mr={selected} showDownload onDownloadPDF={()=>downloadMRWithDocs(selected)} />

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
  topBar:{display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:"4px 0"},
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



const COLORS_SC = ["#0d6b4e","#1B6CA8","#b8860b","#c0392b","#4a148c"];

function SCAnalytics({ mrs }) {
  const [deptFilter, setDeptFilter] = useState("all");
  const safeMrs     = Array.isArray(mrs)?mrs:[];
  const departments = ["all",...new Set(safeMrs.map(m=>m.department||"Unassigned"))];
  const filtered    = deptFilter==="all"?safeMrs:safeMrs.filter(m=>(m.department||"Unassigned")===deptFilter);

  const pendingMRs   = filtered.filter(m=>m.status==="APPROVED");
  const inProcessMRs = filtered.filter(m=>m.status==="IN_PROCESS");
  const issuedMRs    = filtered.filter(m=>m.status==="ISSUED");

  const pieData = [
    {name:"Pending Procurement", value:pendingMRs.length,   fill:"#b8860b"},
    {name:"In Process",          value:inProcessMRs.length, fill:"#1B6CA8"},
    {name:"Issued",              value:issuedMRs.length,    fill:"#0d6b4e"},
  ].filter(d=>d.value>0);

  const byDept={};
  filtered.forEach(mr=>{
    const d=mr.department||"Unassigned";
    if(!byDept[d]) byDept[d]={name:d,APPROVED:0,IN_PROCESS:0,ISSUED:0,spend:0};
    if(byDept[d][mr.status]!==undefined) byDept[d][mr.status]++;
    byDept[d].spend+=parseFloat(mr.total_cost||0);
  });
  const deptData=Object.values(byDept);

  if(filtered.length===0) return (
    <div style={{textAlign:"center",padding:"60px 20px",color:"#aaa"}}>
      <div style={{fontSize:40,marginBottom:12}}>📊</div>
      <div style={{fontSize:14,fontWeight:600}}>No MR data for selected filter</div>
    </div>
  );

  return (
    <div>
      {/* Filter */}
      <div style={{display:"flex",gap:16,marginBottom:20,background:"#e0f2f1",border:"1px solid #b2dfdb",borderRadius:8,padding:"12px 16px",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:"#0d6b4e",textTransform:"uppercase",marginBottom:4}}>Department</div>
          <select style={{border:"1px solid #b2dfdb",borderRadius:5,padding:"6px 10px",fontSize:12,outline:"none",color:"#0d6b4e",fontWeight:600,background:"#fff",minWidth:180}}
            value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}>
            {departments.map(d=><option key={d} value={d}>{d==="all"?"All Departments":d}</option>)}
          </select>
        </div>
        <div style={{marginLeft:"auto",fontSize:12,color:"#0d6b4e"}}>Showing <strong>{filtered.length}</strong> of {safeMrs.length} MRs</div>
      </div>

      {/* KPI cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
        {[
          ["Pending Procurement", pendingMRs.length,   "#b8860b","⏳"],
          ["In Process",          inProcessMRs.length, G.primary,"🔄"],
          ["Issued",              issuedMRs.length,    G.success,"✅"],
        ].map(([l,v,c,icon])=>(
          <div key={l} style={{background:"#fff",border:`1px solid ${G.paleBorder}`,borderRadius:10,padding:"16px",borderLeft:`4px solid ${c}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:28,fontWeight:800,color:c}}>{v}</div>
                <div style={{fontSize:11,color:G.muted,fontWeight:600,textTransform:"uppercase",marginTop:3}}>{l}</div>
              </div>
              <span style={{fontSize:28}}>{icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24}}>
        {/* Pie */}
        <div style={{background:"#fff",border:`1px solid ${G.paleBorder}`,borderRadius:10,padding:"16px 20px"}}>
          <div style={{fontWeight:700,fontSize:13,color:"#0d6b4e",marginBottom:14}}>Processing Stage Split</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({name,value})=>`${value}`} labelLine>
                {pieData.map((entry,i)=><Cell key={i} fill={entry.fill}/>)}
              </Pie>
              <Tooltip/>
              <Legend wrapperStyle={{fontSize:11}}/>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Dept stacked bar */}
        <div style={{background:"#fff",border:`1px solid ${G.paleBorder}`,borderRadius:10,padding:"16px 20px"}}>
          <div style={{fontWeight:700,fontSize:13,color:"#0d6b4e",marginBottom:14}}>Department Wise MR Stages</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deptData} margin={{left:0,right:10}}>
              <CartesianGrid strokeDasharray="3 3"/>
              <XAxis dataKey="name" tick={{fontSize:9}} interval={0} angle={-15} textAnchor="end" height={45}/>
              <YAxis tick={{fontSize:10}}/>
              <Tooltip/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey="APPROVED"   name="Pending Issuance" stackId="a" fill="#1B6CA8"/>
              <Bar dataKey="IN_PROCESS" name="In Process"       stackId="a" fill="#b8860b"/>
              <Bar dataKey="ISSUED"     name="Issued"           stackId="a" fill="#0d6b4e" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pending table */}
      <div style={{fontWeight:700,fontSize:13,color:"#0d6b4e",marginBottom:10,textTransform:"uppercase",paddingBottom:4,borderBottom:"2px solid #0d6b4e"}}>
        Pending Procurement ({pendingMRs.length})
      </div>
      {pendingMRs.length===0?<div style={{color:"#aaa",marginBottom:20}}>No pending MRs.</div>:(
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:20}}>
          <thead><tr>{["MR Number","Vessel","Department","Job No.","Submitted By","Total (AED)"].map(h=>(
            <th key={h} style={{background:"#0d6b4e",color:"#fff",padding:"7px 10px",textAlign:"left",fontSize:11,fontWeight:600}}>{h}</th>
          ))}</tr></thead>
          <tbody>{pendingMRs.map((mr,i)=>(
            <tr key={mr.mr_id} style={{background:i%2===0?"#fff":"#e0f2f1"}}>
              <td style={{padding:"6px 10px",borderBottom:"1px solid #b2dfdb",fontWeight:600}}>{mr.mr_id}</td>
              <td style={{padding:"6px 10px",borderBottom:"1px solid #b2dfdb"}}>{mr.vessel}</td>
              <td style={{padding:"6px 10px",borderBottom:"1px solid #b2dfdb"}}>{mr.department||"—"}</td>
              <td style={{padding:"6px 10px",borderBottom:"1px solid #b2dfdb"}}>{mr.job_no}</td>
              <td style={{padding:"6px 10px",borderBottom:"1px solid #b2dfdb"}}>{mr.submitted_by_name}</td>
              <td style={{padding:"6px 10px",borderBottom:"1px solid #b2dfdb",fontWeight:600}}>AED {parseFloat(mr.total_cost||0).toLocaleString("en-AE",{minimumFractionDigits:2})}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}