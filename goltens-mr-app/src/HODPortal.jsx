import { useState, useEffect } from "react";
import { listMRs } from "./api";
import MRDetailView from "./MRDetailView";
import MRForm from "./MRForm";
import GoltensLogo from "./GoltensLogo";
import { G } from "./theme";
import { MANAGER_EMAIL, APPROVAL_SLAB } from "./App";
import FormTypeFilter, { filterByFormType } from "./FormTypeFilter";
import FormSelectionModal from "./FormSelectionModal";
import SearchBar from "./SearchBar";
import NotificationBell from "./NotificationBell";
import SLABadge, { getSLADays } from "./SLABadge";
import { downloadMRWithDocs } from "./downloadPDF";
import HelpChatbot from "./HelpChatbot";
import TableFilterHeader, { useTableFilter } from "./TableFilter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";


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

const COLORS_HOD = ["#4a148c","#1B6CA8","#0d6b4e","#b8860b","#c0392b","#00838f"];

function Analytics({ mrs }) {
  const [deptFilter, setDeptFilter]     = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const departments = ["all",...new Set(mrs.map(m=>m.department||"Unassigned"))];
  const statuses    = ["all","PENDING","PENDING_HOD","APPROVED","REJECTED","IN_PROCESS","ISSUED"];
  const filtered    = mrs.filter(m=>{
    const d = deptFilter==="all"||(m.department||"Unassigned")===deptFilter;
    const s = statusFilter==="all"||m.status===statusFilter;
    return d&&s;
  });

  const byDept={};
  filtered.forEach(mr=>{
    const d=mr.department||"Unassigned";
    if(!byDept[d]) byDept[d]={name:d,spend:0,PENDING:0,PENDING_HOD:0,APPROVED:0,IN_PROCESS:0,ISSUED:0,REJECTED:0};
    byDept[d].spend+=parseFloat(mr.total_cost||0);
    if(byDept[d][mr.status]!==undefined) byDept[d][mr.status]++;
  });
  const deptData=Object.values(byDept).sort((a,b)=>b.spend-a.spend);

  // Monthly trend
  const byMonth={};
  filtered.forEach(mr=>{
    const d=mr.date_requested||mr.created_at?.split("T")[0];
    if(!d) return;
    const m=d.substring(0,7);
    byMonth[m]=(byMonth[m]||0)+1;
  });
  const trendData=Object.entries(byMonth).sort().map(([month,count])=>({month,count}));

  const statusCounts={};
  filtered.forEach(m=>{statusCounts[m.status]=(statusCounts[m.status]||0)+1;});
  const pieData=Object.entries(statusCounts).map(([name,value])=>({name:name.replace(/_/g," "),value}));
  const totalSpend=filtered.reduce((s,m)=>s+parseFloat(m.total_cost||0),0);
  const slaCount=filtered.filter(m=>getSLADays(m)!==null).length;
  const hodPending=filtered.filter(m=>m.status==="PENDING_HOD").length;

  return (
    <div>
      {/* Filters */}
      <div style={{display:"flex",gap:16,marginBottom:20,background:"#f3e5f5",border:"1px solid #ce93d8",borderRadius:8,padding:"12px 16px",alignItems:"center",flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:"#4a148c",textTransform:"uppercase",marginBottom:4}}>Department</div>
          <select style={{border:"1px solid #ce93d8",borderRadius:5,padding:"6px 10px",fontSize:12,outline:"none",color:"#4a148c",fontWeight:600,background:"#fff",minWidth:180}}
            value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}>
            {departments.map(d=><option key={d} value={d}>{d==="all"?"All Departments":d}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:"#4a148c",textTransform:"uppercase",marginBottom:4}}>Status</div>
          <select style={{border:"1px solid #ce93d8",borderRadius:5,padding:"6px 10px",fontSize:12,outline:"none",color:"#4a148c",fontWeight:600,background:"#fff",minWidth:160}}
            value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            {statuses.map(s=><option key={s} value={s}>{s==="all"?"All Statuses":s.replace(/_/g," ")}</option>)}
          </select>
        </div>
        <div style={{marginLeft:"auto",fontSize:12,color:"#4a148c"}}>Showing <strong>{filtered.length}</strong> of {mrs.length} MRs</div>
      </div>

      {/* KPI cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
        {[
          ["Total MRs",    filtered.length,   "#4a148c","📋"],
          ["Total Spend",  `AED ${(totalSpend/1000).toFixed(0)}K`, G.primary,"💰"],
          ["HOD Pending",  hodPending,         "#7b1fa2","🔺"],
          ["Overdue", slaCount,           slaCount>0?"#e53935":G.success,"⚠"],
        ].map(([l,v,c,icon])=>(
          <div key={l} style={{background:"#fff",border:`1px solid ${G.paleBorder}`,borderRadius:10,padding:"16px",borderLeft:`4px solid ${c}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div>
                <div style={{fontSize:11,color:G.muted,fontWeight:600,textTransform:"uppercase",marginTop:3}}>{l}</div>
              </div>
              <span style={{fontSize:24}}>{icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:20,marginBottom:24}}>
        {/* Dept grouped bar */}
        <div style={{background:"#fff",border:`1px solid ${G.paleBorder}`,borderRadius:10,padding:"16px 20px"}}>
          <div style={{fontWeight:700,fontSize:13,color:"#4a148c",marginBottom:14}}>Department Spend (AED)</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptData} margin={{left:10,right:20}}>
              <CartesianGrid strokeDasharray="3 3"/>
              <XAxis dataKey="name" tick={{fontSize:10}} interval={0} angle={-15} textAnchor="end" height={50}/>
              <YAxis tick={{fontSize:10}}/>
              <Tooltip formatter={v=>`AED ${v.toLocaleString("en-AE",{minimumFractionDigits:0})}`}/>
              <Bar dataKey="spend" name="Total Spend" radius={[4,4,0,0]}>
                {deptData.map((_,i)=><Cell key={i} fill={COLORS_HOD[i%COLORS_HOD.length]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie */}
        <div style={{background:"#fff",border:`1px solid ${G.paleBorder}`,borderRadius:10,padding:"16px 20px"}}>
          <div style={{fontWeight:700,fontSize:13,color:"#4a148c",marginBottom:14}}>Status Split</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="45%" innerRadius={40} outerRadius={75} dataKey="value">
                {pieData.map((_,i)=><Cell key={i} fill={COLORS_HOD[i%COLORS_HOD.length]}/>)}
              </Pie>
              <Tooltip/>
              <Legend wrapperStyle={{fontSize:10}}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly trend */}
      {trendData.length>1 && (
        <div style={{background:"#fff",border:`1px solid ${G.paleBorder}`,borderRadius:10,padding:"16px 20px",marginBottom:24}}>
          <div style={{fontWeight:700,fontSize:13,color:"#4a148c",marginBottom:14}}>Monthly Submission Trend</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData} margin={{left:10,right:20}}>
              <CartesianGrid strokeDasharray="3 3"/>
              <XAxis dataKey="month" tick={{fontSize:10}}/>
              <YAxis tick={{fontSize:10}}/>
              <Tooltip/>
              <Line type="monotone" dataKey="count" name="MRs Submitted" stroke="#4a148c" strokeWidth={2} dot={{r:4}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Dept stacked bar by status */}
      <div style={{background:"#fff",border:`1px solid ${G.paleBorder}`,borderRadius:10,padding:"16px 20px"}}>
        <div style={{fontWeight:700,fontSize:13,color:"#4a148c",marginBottom:14}}>Department Status Breakdown</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={deptData} margin={{left:10,right:20}}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="name" tick={{fontSize:10}} interval={0} angle={-15} textAnchor="end" height={50}/>
            <YAxis tick={{fontSize:10}}/>
            <Tooltip/>
            <Legend wrapperStyle={{fontSize:11}}/>
            <Bar dataKey="PENDING_HOD" name="Pending HOD" stackId="a" fill="#7b1fa2"/>
            <Bar dataKey="APPROVED"    name="Approved"    stackId="a" fill={G.success}/>
            <Bar dataKey="ISSUED"      name="Issued"      stackId="a" fill="#0d6b4e"/>
            <Bar dataKey="REJECTED"    name="Rejected"    stackId="a" fill={G.danger} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}




function getStatusNote(status) {
  switch(status) {
    case "PENDING":      return { note:"Awaiting Manager approval",       next:"Manager will review and approve or reject" };
    case "PENDING_HOD":  return { note:"Awaiting HOD/GM approval",        next:"HOD will give final approval (amount >AED 5K)" };
    case "APPROVED":     return { note:"Approved — with Supply Chain",     next:"SC team will process and arrange items" };
    case "IN_PROCESS":   return { note:"SC processing — stock pending",    next:"Warehouse will issue once stock is available" };
    case "ISSUED":       return { note:"Items issued by Warehouse ✓",     next:"Process complete" };
    case "REJECTED":     return { note:"Rejected — returned to user",      next:"User can edit and resubmit" };
    default:             return { note:"—", next:"—" };
  }
}

function StatusTable({ mrs, allMrs, formFilter, setFormFilter, onOpen, accentColor }) {
  const cols = [
    {key:"mr_id",            label:"MR Number"},
    {key:"vessel",           label:"Vessel"},
    {key:"department",       label:"Dept"},
    {key:"job_no",           label:"Job No."},
    {key:"submitted_by_name",label:"Submitted By"},
    {key:"total_cost",       label:"Total (AED)"},
    {key:"status",           label:"Status"},
    {key:"note",             label:"Current Status / Next Step"},
  ];
  const { filtered, filters, setFilter, clearFilters, hasFilters } = useTableFilter(mrs, cols);
  return (
    <div>
      <div style={{fontWeight:700,fontSize:18,color:accentColor,marginBottom:16,paddingBottom:12,borderBottom:`2px solid ${accentColor}`}}>All MR Status</div>
      <FormTypeFilter mrs={allMrs} selected={formFilter} onChange={setFormFilter} accentColor={accentColor}/>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <TableFilterHeader columns={cols} rows={mrs} filters={filters} onFilter={setFilter} onClear={clearFilters} hasFilters={hasFilters}/>
          <tbody>
            {filtered.map((mr,i)=>(
              <tr key={mr.mr_id} style={{background:i%2===0?"#fff":G.pale,cursor:"pointer"}} onClick={()=>onOpen(mr)}>
                <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.paleBorder}`}}><strong>{mr.mr_id}</strong></td>
                <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.paleBorder}`}}>{mr.vessel}</td>
                <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.paleBorder}`}}>{mr.department||"—"}</td>
                <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.paleBorder}`}}>{mr.job_no}</td>
                <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.paleBorder}`}}>{mr.submitted_by_name}</td>
                <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.paleBorder}`}}>{parseFloat(mr.total_cost||0).toLocaleString("en-AE",{minimumFractionDigits:2})}</td>
                <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.paleBorder}`}}>
                  <span style={{background:"#f3e5f5",color:accentColor,borderRadius:8,padding:"2px 8px",fontSize:11,fontWeight:600}}>{mr.status?.replace(/_/g," ")}</span>
                </td>
                <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.paleBorder}`,maxWidth:220}}>
                  <div style={{fontSize:11,fontWeight:600,color:G.navy}}>{getStatusNote(mr.status).note}</div>
                  <div style={{fontSize:10,color:G.muted,marginTop:2}}>↳ {getStatusNote(mr.status).next}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{fontSize:11,color:G.muted,marginTop:8}}>Showing {filtered.length} of {mrs.length} MRs</div>
      </div>
    </div>
  );
}

export default function HODPortal({ session, onLogout }) {
  const [view, setView]           = useState("analytics");
  const [mrs, setMrs]             = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [actionDone, setActionDone] = useState(null);
  const [rejComment, setRejComment] = useState("");
  const [rejectErr, setRejectErr]   = useState("");
  const [actioning, setActioning]   = useState(false);
  const [formFilter, setFormFilter] = useState("all");
  const [showFormModal, setShowFormModal] = useState(false);
  const [selectedFormType, setSelectedFormType] = useState(null);

  const loadMRs = async () => {
    try { const d=await listMRs("ALL"); setMrs(Array.isArray(d)?d:[]); } catch(e){console.error(e);}
    setLoading(false);
  };

  useEffect(()=>{ loadMRs(); const t=setInterval(loadMRs,120000); return()=>clearInterval(t); },[]);
  useEffect(()=>{ if(selected&&mrs.length>0){ const u=mrs.find(m=>m.mr_id===selected.mr_id); if(u)setSelected(u); } },[mrs]);

  const filteredMRs = filterByFormType(mrs, formFilter);
  const openMR = mr => { setSelected(mr); setActionDone(null); setRejComment(""); setRejectErr(""); };
  const actor  = session.name || session.email;

  const doApprove = async () => {
    setActioning(true);
    const r = await call("hod_approve_mr",{mr_id:selected.mr_id,approved_by:actor,approver_id:session.id_no||"H-01",comments:""});
    if(r?.success!==false){ setActionDone("APPROVED"); loadMRs(); }
    setActioning(false);
  };
  const doReject = async () => {
    if(!rejComment.trim()){setRejectErr("Rejection reason is mandatory.");return;}
    setActioning(true);
    const r = await call("reject_mr",{mr_id:selected.mr_id,rejected_by:actor,reason:rejComment});
    if(r?.success!==false){ setActionDone("REJECTED"); loadMRs(); }
    setActioning(false);
  };
  const doRevert = async () => {
    if(!window.confirm(`Revert MR ${selected.mr_id} back to PENDING?`)) return;
    setActioning(true);
    const r = await call("revert_mr",{mr_id:selected.mr_id,reverted_by:actor});
    if(r?.success!==false){ setActionDone("REVERTED"); loadMRs(); }
    setActioning(false);
  };

  const pendingHOD = filteredMRs.filter(m=>m.status==="PENDING_HOD");
  const canAction  = selected?.status==="PENDING_HOD";
  const canRevert  = ["APPROVED","REJECTED"].includes(selected?.status);

  return (
    <div style={s.page}>
      <div style={s.shell}>
        <div style={s.sidebar}>
          <div style={s.sideHeader}><GoltensLogo size="sm" dark style={{flexShrink:0}}/></div>
          <div style={s.portalLabel}>GM / HOD Portal</div>
          <div style={s.topActions}>
            <button style={s.refreshBtn} onClick={loadMRs}>↻ Refresh</button>
            <button style={s.logoutBtn} onClick={onLogout}>Log Out</button>
          </div>
          <div style={s.sideSection}>NAVIGATION</div>
          {[{key:"queue",label:"📋 Pending Approval"},{key:"analytics",label:"📊 Analytics"},{key:"all",label:"🔍 All MR Status"},{key:"submit",label:"➕ Submit New Form"}].map(({key,label})=>(
            <div key={key} style={{...s.navItem,...(view===key?s.navItemActive:{})}} onClick={()=>{ if(key==="submit"){setShowFormModal(true);}else{setView(key);} }}>{label}</div>
          ))}
          <div style={{padding:"0 12px 4px"}}>
            <FormTypeFilter mrs={mrs} selected={formFilter} onChange={setFormFilter} accentColor="rgba(255,255,255,0.9)" compact/>
          </div>
          <div style={s.sideSection}>PENDING HOD ({pendingHOD.length})</div>
          {loading&&<div style={s.sideLoading}>Loading…</div>}
          {!loading&&pendingHOD.length===0&&<div style={s.sideLoading}>No MRs pending HOD approval.</div>}
          {pendingHOD.map(mr=>(
            <div key={mr.mr_id} style={{...s.mrCard,...(selected?.mr_id===mr.mr_id?s.mrCardActive:{})}} onClick={()=>{setView("queue");openMR(mr);}}>
              <div style={s.mrCardTop}>
                <div style={s.mrCardId}>{mr.mr_id}</div>
                {mr.document_s3_keys?.length>0&&<div style={s.docBadge}>📎{mr.document_s3_keys.length}</div>}
              </div>
              <div style={s.mrCardMeta}>{mr.vessel} · {mr.submitted_by_name}</div>
              <div style={{display:"inline-block",marginTop:5,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:"rgba(206,147,216,0.3)",color:"#e1bee7"}}>PENDING HOD</div>
            </div>
          ))}
          
        </div>

        <div style={s.main}>
          <div style={s.topBar}>
            <SearchBar mrs={mrs} onSelect={mr=>{openMR(mr);setView("queue");}} />
            <NotificationBell mrs={mrs} role="hod" userEmail={session.email} accentColor={"#4a148c"}/>
          </div>
          {view==="analytics"&&(<div><div style={s.pageTitle}>Project Analytics</div><FormTypeFilter mrs={mrs} selected={formFilter} onChange={setFormFilter} accentColor="#4a148c"/><Analytics mrs={filteredMRs}/></div>)}

          {view==="all" && (
            <StatusTable mrs={filteredMRs} allMrs={mrs} formFilter={formFilter} setFormFilter={setFormFilter}
              onOpen={mr=>{openMR(mr);setView("queue");}} accentColor="#4a148c"/>
          )}

          {view==="submit" && (
            <div>
              <div style={s.pageTitle}>
                Submit New Form
                <button style={{marginLeft:12,background:"#f0f0f0",border:"1px solid #ddd",borderRadius:5,padding:"4px 12px",fontSize:12,cursor:"pointer"}} onClick={()=>setShowFormModal(true)}>Change Form ▼</button>
              </div>
              {!selectedFormType ? (
                <div style={{textAlign:"center",padding:60}}>
                  <div style={{fontSize:48,marginBottom:16}}>📋</div>
                  <div style={{fontSize:16,fontWeight:700,color:"#4a148c",marginBottom:8}}>Select a Form to Submit</div>
                  <div style={{fontSize:13,color:G.muted,marginBottom:24}}>Click below to choose which form you want to fill.</div>
                  <button style={{background:"linear-gradient(135deg,#7b1fa2,#4a148c)",color:"#fff",border:"none",borderRadius:6,padding:"12px 32px",fontSize:14,fontWeight:700,cursor:"pointer"}}
                    onClick={()=>setShowFormModal(true)}>
                    Choose Form →
                  </button>
                </div>
              ) : selectedFormType==="material_requisition" ? (
                <MRForm session={session} managerEmail={MANAGER_EMAIL} hodEmail={session.email} approvalSlab={APPROVAL_SLAB} formType={selectedFormType} onLogout={()=>setView("queue")} isEmbedded/>
              ) : (
                <div style={{textAlign:"center",padding:60,color:"#aaa"}}>
                  <div style={{fontSize:48,marginBottom:16}}>🚧</div>
                  <div style={{fontSize:15,fontWeight:600}}>Coming Soon</div>
                  <div style={{fontSize:13,marginTop:8}}>This form is not yet available.</div>
                </div>
              )}
            </div>
          )}

          {view==="queue"&&(
            !selected?(
              <div style={s.emptyState}><div style={{fontSize:48,marginBottom:16}}>🏛️</div>
              <div style={{fontSize:14,color:"#aaa"}}>{pendingHOD.length===0?"No MRs awaiting HOD approval.":"Select an MR from the sidebar to review."}</div></div>
            ):(
              <div>
                <MRDetailView mr={selected} showDownload onDownloadPDF={()=>downloadMRWithDocs(selected)} />
                <div style={s.decisionPanel}>
                  <div style={s.panelTitle}>HOD Decision</div>
                  {canRevert&&(
                    <div style={s.revertBlock}>
                      <div style={s.revertLabel}>↩ MR is <strong>{selected.status?.replace("_"," ")}</strong>. Revert to PENDING to change your decision.</div>
                      <button style={{...s.revertBtn,...(actioning?{opacity:0.7}:{})}} onClick={doRevert} disabled={actioning}>↩ Revert to Pending</button>
                    </div>
                  )}
                  {canAction&&(<>
                    <div style={s.rejectBlock}>
                      <label style={s.rejectLabel}>Rejection Reason <span style={{fontWeight:400,color:G.danger,fontSize:11}}>* required if rejecting</span></label>
                      <textarea style={{...s.textarea,...(rejectErr?{border:`1px solid ${G.danger}`}:{})}} rows={3} placeholder="Provide a clear reason..."
                        value={rejComment} onChange={e=>{setRejComment(e.target.value);setRejectErr("");}}/>
                      {rejectErr&&<span style={{color:G.danger,fontSize:11}}>{rejectErr}</span>}
                    </div>
                    <div style={{display:"flex",gap:12}}>
                      <button style={{...s.approveBtn,...(actioning?{opacity:0.7}:{})}} onClick={doApprove} disabled={actioning}>✓ HOD Approve</button>
                      <button style={{...s.rejectBtn,...(actioning?{opacity:0.7}:{})}} onClick={doReject} disabled={actioning}>✕ HOD Reject</button>
                    </div>
                  </>)}
                  {!canAction&&!canRevert&&<div style={{color:"#aaa",fontSize:13}}>No actions available for this MR status.</div>}
                  {actionDone&&(
                    <div style={{marginTop:12,border:"1px solid",borderRadius:6,padding:"12px 16px",fontSize:13,display:"flex",justifyContent:"space-between",
                      background:actionDone==="APPROVED"?"#e8f5e9":actionDone==="REJECTED"?"#fff5f5":"#fff8e1",
                      borderColor:actionDone==="APPROVED"?"#a5d6a7":actionDone==="REJECTED"?"#f5c6c6":"#ffe082"}}>
                      {actionDone==="REVERTED"?"↩ MR reverted to PENDING.":`✓ MR ${actionDone}. Submitter notified.`}
                      <button style={{background:"none",border:"none",cursor:"pointer",color:"#888"}} onClick={()=>setActionDone(null)}>✕</button>
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>
      <HelpChatbot role="hod" userName={session?.name} userEmail={session?.email} />
      {showFormModal && (
        <FormSelectionModal
          portalColor="#4a148c"
          onClose={()=>setShowFormModal(false)}
          onSelect={(formType)=>{ setSelectedFormType(formType); setShowFormModal(false); setView("submit"); }}
        />
      )}
    </div>
  );
}

const s = {
  page:{minHeight:"100vh",background:"#f0f2f5",fontFamily:"'Segoe UI',Arial,sans-serif",fontSize:13},
  shell:{display:"flex",minHeight:"100vh"},
  sidebar:{width:260,background:"#4a148c",color:"#fff",display:"flex",flexDirection:"column",padding:"0 0 16px",flexShrink:0},
  sideHeader:{padding:"20px 20px 8px",borderBottom:"1px solid rgba(255,255,255,0.15)"},
  portalLabel:{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.7)",letterSpacing:1,textTransform:"uppercase",padding:"8px 20px 12px"},
  sideSection:{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.45)",letterSpacing:1.5,padding:"10px 20px 6px"},
  navItem:{margin:"2px 12px",padding:"9px 12px",borderRadius:6,cursor:"pointer",fontSize:13,color:"rgba(255,255,255,0.8)"},
  navItemActive:{background:"rgba(255,255,255,0.2)",color:"#fff",fontWeight:600},
  sideLoading:{fontSize:11,color:"rgba(255,255,255,0.4)",padding:"8px 20px"},
  mrCard:{margin:"2px 12px",padding:"10px 12px",borderRadius:6,cursor:"pointer"},
  mrCardActive:{background:"rgba(255,255,255,0.15)"},
  mrCardTop:{display:"flex",justifyContent:"space-between",alignItems:"center"},
  mrCardId:{fontWeight:700,fontSize:12,color:"#fff"},
  docBadge:{fontSize:10,color:"rgba(255,255,255,0.7)",background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"1px 7px"},
  mrCardMeta:{fontSize:11,color:"rgba(255,255,255,0.65)",marginTop:3},
  sideFooter:{marginTop:"auto",padding:"16px 20px 0",borderTop:"1px solid rgba(255,255,255,0.1)",display:"flex",flexDirection:"column",gap:8},
  pendingNote:{fontSize:11,color:"rgba(255,255,255,0.5)"},
  refreshBtn:{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",borderRadius:4,padding:"6px 14px",fontSize:12,cursor:"pointer"},
  logoutBtn:{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",color:"#fff",borderRadius:4,padding:"6px 14px",fontSize:12,cursor:"pointer"},
  topBar:        { display:"flex", alignItems:"center", gap:10, marginBottom:20, padding:"4px 0", justifyContent:"space-between" },
  main:{flex:1,padding:"28px 32px",overflowY:"auto"},
  pageTitle:{fontWeight:700,fontSize:18,color:"#4a148c",marginBottom:20,paddingBottom:12,borderBottom:"2px solid #4a148c"},
  emptyState:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"60vh"},
  table:{width:"100%",borderCollapse:"collapse",fontSize:12},
  th:{background:"#4a148c",color:"#fff",padding:"8px 10px",textAlign:"left",fontWeight:600,fontSize:11},
  trEven:{background:"#fff"},trOdd:{background:G.pale},
  td:{padding:"7px 10px",borderBottom:`1px solid ${G.paleBorder}`,cursor:"pointer"},
  decisionPanel:{background:"#fafbfc",border:`1px solid ${G.paleBorder}`,borderRadius:8,padding:"20px 24px",marginTop:16},
  panelTitle:{fontWeight:700,fontSize:13,color:"#333",marginBottom:14,textTransform:"uppercase",letterSpacing:0.5},
  revertBlock:{background:"#fff8e1",border:"1px solid #ffe082",borderRadius:6,padding:"12px 16px",marginBottom:16},
  revertLabel:{fontSize:13,color:"#5d4037",marginBottom:10},
  revertBtn:{background:"#f57f17",color:"#fff",border:"none",borderRadius:5,padding:"8px 20px",fontSize:12,fontWeight:700,cursor:"pointer"},
  rejectBlock:{marginBottom:16},
  rejectLabel:{display:"block",fontWeight:600,fontSize:12,color:"#333",marginBottom:6},
  textarea:{width:"100%",border:`1px solid ${G.paleBorder}`,borderRadius:4,padding:"8px 10px",fontSize:13,resize:"vertical",outline:"none",boxSizing:"border-box"},
  approveBtn:{background:"#1a7a4a",color:"#fff",border:"none",borderRadius:5,padding:"10px 28px",fontSize:13,fontWeight:700,cursor:"pointer"},
  rejectBtn:{background:G.danger,color:"#fff",border:"none",borderRadius:5,padding:"10px 28px",fontSize:13,fontWeight:700,cursor:"pointer"},
};