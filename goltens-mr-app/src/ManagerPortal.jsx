import { useState, useEffect } from "react";
import { listMRs, approveMR, rejectMR } from "./api";
import MRDetailView from "./MRDetailView";
import MRForm from "./MRForm";
import GoltensLogo from "./GoltensLogo";
import { G } from "./theme";
import { HOD_EMAIL, APPROVAL_SLAB } from "./App";
import FormTypeFilter, { filterByFormType } from "./FormTypeFilter";
import FormSelectionModal from "./FormSelectionModal";
import SearchBar from "./SearchBar";
import NotificationBell from "./NotificationBell";
import SLABadge, { getSLADays } from "./SLABadge";
import { downloadMRWithDocs } from "./downloadPDF";
import HelpChatbot from "./HelpChatbot";
import TableFilterHeader, { useTableFilter } from "./TableFilter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

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

const COLORS = ["#1B6CA8","#1a7a4a","#b8860b","#c0392b","#7b1fa2","#00838f","#e65100"];

function Analytics({ mrs }) {
  const [jobFilter, setJobFilter] = useState("all");
  const jobs = ["all",...new Set(mrs.map(m=>m.job_no||"Unassigned"))];
  const filtered = jobFilter==="all"?mrs:mrs.filter(m=>(m.job_no||"Unassigned")===jobFilter);

  const byJob = {};
  filtered.forEach(mr=>{
    const k=mr.job_no||"Unassigned";
    if(!byJob[k]) byJob[k]={job:`Job No: ${k}`,total:0,pending:0,approved:0,rejected:0};
    byJob[k].total+=parseFloat(mr.total_cost||0);
    if(["PENDING","PENDING_HOD"].includes(mr.status)) byJob[k].pending++;
    else if(mr.status==="APPROVED"||mr.status==="ISSUED") byJob[k].approved++;
    else if(mr.status==="REJECTED") byJob[k].rejected++;
  });
  const barData = Object.values(byJob).sort((a,b)=>b.total-a.total).slice(0,10);

  const statusCounts={};
  filtered.forEach(m=>{statusCounts[m.status]=(statusCounts[m.status]||0)+1;});
  const pieData = Object.entries(statusCounts).map(([name,value])=>({name:name.replace(/_/g," "),value}));
  const totalSpend = filtered.reduce((s,m)=>s+parseFloat(m.total_cost||0),0);
  const slaCount = filtered.filter(m=>getSLADays(m)!==null).length;

  return (
    <div>
      {/* Filter */}
      <div style={{display:"flex",gap:16,marginBottom:20,background:G.pale,border:`1px solid ${G.paleBorder}`,borderRadius:8,padding:"12px 16px",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",marginBottom:4}}>Job Number</div>
          <select style={{border:`1px solid ${G.paleBorder}`,borderRadius:5,padding:"6px 10px",fontSize:12,outline:"none",color:G.navy,fontWeight:600,background:"#fff",minWidth:180}}
            value={jobFilter} onChange={e=>setJobFilter(e.target.value)}>
            {jobs.map(j=><option key={j} value={j}>{j==="all"?"All Jobs":"Job No: "+j}</option>)}
          </select>
        </div>
        <div style={{marginLeft:"auto",fontSize:12,color:G.muted}}>Showing <strong>{filtered.length}</strong> of {mrs.length} MRs</div>
      </div>

      {/* KPI Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
        {[
          ["Total MRs",    filtered.length,  G.navy,    "📋"],
          ["Total Spend",  `AED ${(totalSpend/1000).toFixed(0)}K`, G.primary, "💰"],
          ["Approved",     (statusCounts["APPROVED"]||0)+(statusCounts["ISSUED"]||0), G.success, "✅"],
          ["Overdue", slaCount, slaCount>0?"#e53935":G.success, "⚠"],
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
        {/* Bar chart spend by job */}
        <div style={{background:"#fff",border:`1px solid ${G.paleBorder}`,borderRadius:10,padding:"16px 20px"}}>
          <div style={{fontWeight:700,fontSize:13,color:G.navy,marginBottom:14}}>Spend by Job Number (AED)</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{left:10,right:20}}>
              <CartesianGrid strokeDasharray="3 3"/>
              <XAxis dataKey="job" tick={{fontSize:10}} interval={0} angle={-20} textAnchor="end" height={50}/>
              <YAxis tick={{fontSize:10}}/>
              <Tooltip formatter={(v)=>`AED ${v.toLocaleString("en-AE",{minimumFractionDigits:0})}`}/>
              <Bar dataKey="total" name="Total Spend" fill={G.primary} radius={[4,4,0,0]}>
                {barData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie status */}
        <div style={{background:"#fff",border:`1px solid ${G.paleBorder}`,borderRadius:10,padding:"16px 20px"}}>
          <div style={{fontWeight:700,fontSize:13,color:G.navy,marginBottom:14}}>Status Distribution</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="45%" outerRadius={75} dataKey="value" label={({name,value})=>`${value}`} labelLine={false}>
                {pieData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie>
              <Tooltip formatter={(v,name)=>[v,name]}/>
              <Legend wrapperStyle={{fontSize:10}}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Approval breakdown bar */}
      <div style={{background:"#fff",border:`1px solid ${G.paleBorder}`,borderRadius:10,padding:"16px 20px"}}>
        <div style={{fontWeight:700,fontSize:13,color:G.navy,marginBottom:14}}>Approval Status by Job Number</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} margin={{left:10,right:20}}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="job" tick={{fontSize:10}} interval={0} angle={-20} textAnchor="end" height={50}/>
            <YAxis tick={{fontSize:10}}/>
            <Tooltip/>
            <Legend wrapperStyle={{fontSize:11}}/>
            <Bar dataKey="pending"  name="Pending"  stackId="a" fill="#b8860b"/>
            <Bar dataKey="approved" name="Approved" stackId="a" fill={G.success}/>
            <Bar dataKey="rejected" name="Rejected" stackId="a" fill={G.danger} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}



const STATUS_COLS = [
  {key:"mr_id",            label:"MR Number"},
  {key:"vessel",           label:"Vessel"},
  {key:"department",       label:"Dept"},
  {key:"job_no",           label:"Job No."},
  {key:"submitted_by_name",label:"Submitted By"},
  {key:"total_cost",       label:"Total (AED)"},
  {key:"status",           label:"Status"},
  {key:"note",             label:"Current Status / Next Step"},
];


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
  const { filtered, filters, setFilter, clearFilters, hasFilters } = useTableFilter(mrs, STATUS_COLS);
  return (
    <div>
      <div style={{fontWeight:700,fontSize:18,color:G.navy,marginBottom:16,paddingBottom:12,borderBottom:`2px solid ${accentColor||G.primary}`}}>All MR Status</div>
      <FormTypeFilter mrs={allMrs} selected={formFilter} onChange={setFormFilter} accentColor={accentColor}/>
      {mrs.length===0 ? <div style={{color:"#aaa",padding:20}}>No MRs found.</div> : (
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <TableFilterHeader columns={STATUS_COLS} rows={mrs} filters={filters} onFilter={setFilter} onClear={clearFilters} hasFilters={hasFilters}/>
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
                    <span style={{background:G.pale,color:G.navy,borderRadius:8,padding:"2px 8px",fontSize:11,fontWeight:600}}>{mr.status?.replace(/_/g," ")}</span>
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
      )}
    </div>
  );
}

export default function ManagerPortal({ session, onLogout }) {
  const [view, setView]             = useState("analytics");
  const [mrs, setMrs]               = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [actionDone, setActionDone] = useState(null);
  const [rejComment, setRejComment] = useState("");
  const [rejectErr, setRejectErr]   = useState("");
  const [escalateNote, setEscalateNote] = useState("");
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
  const openMR = mr => { setSelected(mr); setActionDone(null); setRejComment(""); setRejectErr(""); setEscalateNote(""); };
  const actor      = session.name || session.email;
  const managerId  = session.id_no || "M-01";

  const doApprove = async () => {
    setActioning(true);
    const r = await approveMR(selected.mr_id, actor, "", managerId);
    if(r?.success!==false){ setActionDone(r?.status==="PENDING_HOD"?"ESCALATED_HOD":"APPROVED"); loadMRs(); }
    setActioning(false);
  };
  const doReject = async () => {
    if(!rejComment.trim()){ setRejectErr("Rejection reason is mandatory."); return; }
    setActioning(true);
    const r = await rejectMR(selected.mr_id, actor, rejComment);
    if(r?.success!==false){ setActionDone("REJECTED"); loadMRs(); }
    setActioning(false);
  };
  const doEscalate = async () => {
    setActioning(true);
    const r = await call("escalate_to_hod",{mr_id:selected.mr_id,escalated_by:actor,note:escalateNote||"Escalated for HOD review"});
    if(r?.success!==false){ setActionDone("ESCALATED_HOD"); loadMRs(); }
    setActioning(false);
  };
  const doRevert = async () => {
    if(!window.confirm(`Revert MR ${selected.mr_id} back to PENDING?`)) return;
    setActioning(true);
    const r = await call("revert_mr",{mr_id:selected.mr_id,reverted_by:actor});
    if(r?.success!==false){ setActionDone("REVERTED"); loadMRs(); }
    setActioning(false);
  };

  const canAction    = ["PENDING","PENDING_HOD","IN_PROCESS"].includes(selected?.status);
  const canRevert    = ["APPROVED","REJECTED","IN_PROCESS","PENDING_HOD"].includes(selected?.status);
  const pendingCount = filteredMRs.filter(m=>["PENDING","PENDING_HOD"].includes(m.status)).length;

  function statusBadgeStyle(st) {
    if(st==="APPROVED"||st==="ISSUED")  return {background:"rgba(50,200,100,0.2)",  color:"#2ecc71"};
    if(st==="REJECTED")                 return {background:"rgba(220,50,50,0.2)",   color:"#e74c3c"};
    if(st==="IN_PROCESS")               return {background:"rgba(255,165,0,0.2)",   color:"#ffa500"};
    if(st==="PENDING_HOD")              return {background:"rgba(180,100,220,0.2)", color:"#ce93d8"};
    return {background:"rgba(255,200,50,0.25)", color:"#ffd166"};
  }

  const textareaStyle = (hasErr) => ({
    ...s.textarea,
    ...(hasErr ? { border:`1px solid ${G.danger}` } : {}),
  });

  return (
    <div style={s.page}>
      <div style={s.shell}>

        {/* ── Sidebar ── */}
        <div style={s.sidebar}>
          <div style={s.sideHeader}><GoltensLogo size="sm" dark style={{flexShrink:0}}/></div>
          <div style={s.portalLabel}>Manager Portal</div>
          <div style={s.topActions}>
            <button style={s.refreshBtn} onClick={loadMRs}>↻ Refresh</button>
            <button style={s.logoutBtn} onClick={onLogout}>Log Out</button>
          </div>

          <div style={s.sideSection}>NAVIGATION</div>
          {[
            {key:"queue",     label:"📋 MR Queue"},
            {key:"analytics", label:"📊 Analytics"},
            {key:"status",    label:"🔍 All MR Status"},
            {key:"submit",    label:"➕ Submit New Form"},
          ].map(({key,label})=>(
            <div key={key} style={{...s.navItem,...(view===key?s.navItemActive:{})}} onClick={()=>setView(key)}>{label}</div>
          ))}

          <div style={{padding:"6px 12px"}}>
            <FormTypeFilter mrs={mrs} selected={formFilter} onChange={setFormFilter} accentColor="rgba(255,255,255,0.9)" compact/>
          </div>
          <div style={s.sideSection}>PENDING QUEUE</div>
          {loading && <div style={s.sideLoading}>Loading…</div>}
          {!loading && mrs.filter(m=>["PENDING","PENDING_HOD"].includes(m.status)).length===0 &&
            <div style={s.sideLoading}>No pending MRs.</div>}
          {filteredMRs.filter(m=>["PENDING","PENDING_HOD"].includes(m.status)).map(mr=>(
            <div key={mr.mr_id}
              style={{...s.mrCard,...(selected?.mr_id===mr.mr_id?s.mrCardActive:{})}}
              onClick={()=>{setView("queue");openMR(mr);}}>
              <div style={s.mrCardTop}>
                <div style={s.mrCardId}>{mr.mr_id}</div>
                {mr.document_s3_keys?.length>0 && <div style={s.docBadge}>📎{mr.document_s3_keys.length}</div>}
              </div>
              <div style={s.mrCardMeta}>{mr.vessel} · {mr.submitted_by_name}</div>
              <div style={{...s.badge,...statusBadgeStyle(mr.status)}}>{mr.status?.replace("_"," ")}</div>
            </div>
          ))}

          
        </div>

        {/* ── Main ── */}
        <div style={s.main}>
          <div style={s.topBar}>
            <SearchBar mrs={mrs} onSelect={mr=>{openMR(mr);setView("queue");}} />
            <NotificationBell mrs={mrs} role="manager" userEmail={session.email} accentColor={G.navy}/>
          </div>

          {/* Analytics */}
          {view==="analytics" && (
            <div>
              <div style={s.pageTitle}>Project Analytics</div>
              <FormTypeFilter mrs={mrs} selected={formFilter} onChange={setFormFilter} accentColor={G.navy}/>
              <Analytics mrs={filteredMRs}/>
            </div>
          )}

          {/* All MR Status */}
          {view==="status" && (
            <StatusTable mrs={filteredMRs} allMrs={mrs} formFilter={formFilter} setFormFilter={setFormFilter}
              onOpen={mr=>{openMR(mr);setView("queue");}} accentColor={G.navy}/>
          )}

          {/* Submit new MR */}
          {view==="submit" && (
            <div>
              <div style={s.pageTitle}>
                Submit New Form
                <button style={{marginLeft:12,background:"#f0f0f0",border:"1px solid #ddd",borderRadius:5,padding:"4px 12px",fontSize:12,cursor:"pointer"}} onClick={()=>setShowFormModal(true)}>Change Form ▼</button>
              </div>
              {!selectedFormType ? (
                <div style={{textAlign:"center",padding:60}}>
                  <div style={{fontSize:48,marginBottom:16}}>📋</div>
                  <div style={{fontSize:16,fontWeight:700,color:G.navy,marginBottom:8}}>Select a Form to Submit</div>
                  <div style={{fontSize:13,color:G.muted,marginBottom:24}}>Click below to choose which form you want to fill.</div>
                  <button style={{background:`linear-gradient(135deg,${G.primary},${G.navy})`,color:"#fff",border:"none",borderRadius:6,padding:"12px 32px",fontSize:14,fontWeight:700,cursor:"pointer"}}
                    onClick={()=>setShowFormModal(true)}>
                    Choose Form →
                  </button>
                </div>
              ) : selectedFormType==="material_requisition" ? (
                <MRForm
                  session={session}
                  managerEmail={HOD_EMAIL}
                  hodEmail={HOD_EMAIL}
                  approvalSlab={0}
                  formType={selectedFormType}
                  onLogout={()=>setView("queue")}
                  isEmbedded
                />
              ) : (
                <div style={{textAlign:"center",padding:60,color:"#aaa"}}>
                  <div style={{fontSize:48,marginBottom:16}}>🚧</div>
                  <div style={{fontSize:15,fontWeight:600}}>Coming Soon</div>
                  <div style={{fontSize:13,marginTop:8}}>This form is not yet available.</div>
                </div>
              )}
            </div>
          )}

          {/* Queue / MR detail */}
          {view==="queue" && (
            !selected ? (
              <div style={s.emptyState}>
                <div style={{fontSize:48,marginBottom:16}}>📋</div>
                <div style={{fontSize:14,color:"#aaa"}}>Select a pending MR to review</div>
              </div>
            ) : (
              <div>
                <SLABadge mr={selected}/>
                <MRDetailView mr={selected} showDownload onDownloadPDF={()=>downloadMRWithDocs(selected)} />

                {/* Decision panel */}
                <div style={s.decisionPanel}>
                  <div style={s.panelTitle}>Decision</div>

                  {/* Revert */}
                  {canRevert && (
                    <div style={s.revertBlock}>
                      <div style={s.revertLabel}>
                        ↩ MR is <strong>{selected.status?.replace("_"," ")}</strong>. Revert to PENDING to change your decision.
                      </div>
                      <button
                        style={{...s.revertBtn,...(actioning?{opacity:0.7}:{})}}
                        onClick={doRevert}
                        disabled={actioning}>
                        ↩ Revert to Pending
                      </button>
                    </div>
                  )}

                  {canAction && (<>
                    {/* Escalate */}
                    <div style={s.escalateBlock}>
                      <div style={s.escalateLabel}>
                        🔺 Escalate to GM/HOD <span style={s.hint}>— send for second-level approval</span>
                      </div>
                      <textarea
                        style={s.textarea}
                        rows={2}
                        placeholder="Note to HOD (optional)"
                        value={escalateNote}
                        onChange={e=>setEscalateNote(e.target.value)}/>
                      <button
                        style={{...s.escalateBtn,...(actioning?{opacity:0.7}:{})}}
                        onClick={doEscalate}
                        disabled={actioning}>
                        🔺 Escalate to HOD
                      </button>
                    </div>

                    <div style={s.divider}/>

                    {/* Reject reason */}
                    <div style={s.rejectBlock}>
                      <label style={s.rejectLabel}>
                        Rejection Reason <span style={s.required}>* required if rejecting</span>
                      </label>
                      <textarea
                        style={textareaStyle(rejectErr)}
                        rows={3}
                        placeholder="Provide a clear reason..."
                        value={rejComment}
                        onChange={e=>{setRejComment(e.target.value);setRejectErr("");}}/>
                      {rejectErr && <span style={{color:G.danger,fontSize:11,marginTop:4,display:"block"}}>{rejectErr}</span>}
                    </div>

                    {/* Approve / Reject buttons */}
                    <div style={s.actionBtns}>
                      <button
                        style={{...s.approveBtn,...(actioning?{opacity:0.7}:{})}}
                        onClick={doApprove}
                        disabled={actioning}>
                        ✓ Approve MR
                      </button>
                      <button
                        style={{...s.rejectBtn,...(actioning?{opacity:0.7}:{})}}
                        onClick={doReject}
                        disabled={actioning}>
                        ✕ Reject MR
                      </button>
                    </div>
                  </>)}

                  {/* Action done banner */}
                  {actionDone && (
                    <div style={{
                      marginTop:12, border:"1px solid", borderRadius:6, padding:"12px 16px",
                      fontSize:13, display:"flex", justifyContent:"space-between",
                      background:   actionDone==="APPROVED"?"#e8f5e9":actionDone==="REJECTED"?"#fff5f5":actionDone==="ESCALATED_HOD"?"#f3e5f5":"#fff8e1",
                      borderColor:  actionDone==="APPROVED"?"#a5d6a7":actionDone==="REJECTED"?"#f5c6c6":actionDone==="ESCALATED_HOD"?"#ce93d8":"#ffe082",
                    }}>
                      {actionDone==="REVERTED"      ? "↩ MR reverted to PENDING."
                      :actionDone==="ESCALATED_HOD" ? "🔺 Escalated to HOD for second-level approval."
                      : `✓ MR ${actionDone.replace("_"," ")}. Submitter notified.`}
                      <button style={{background:"none",border:"none",cursor:"pointer",color:"#888"}} onClick={()=>setActionDone(null)}>✕</button>
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>
      <HelpChatbot role="manager" userName={session?.name} userEmail={session?.email} />
      {showFormModal && (
        <FormSelectionModal
          portalColor={G.navy}
          onClose={()=>setShowFormModal(false)}
          onSelect={(formType)=>{ setSelectedFormType(formType); setShowFormModal(false); setView("submit"); }}
        />
      )}
    </div>
  );
}

/* ── Analytics styles ── */
const an = {
  grid:        { display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:24 },
  card:        { background:G.white, border:`1px solid ${G.paleBorder}`, borderRadius:8, padding:"14px 16px", textAlign:"center" },
  val:         { fontSize:20, fontWeight:700, marginBottom:4 },
  lbl:         { fontSize:11, color:G.muted, fontWeight:600, textTransform:"uppercase" },
  sectionTitle:{ fontWeight:700, fontSize:13, color:"#333", marginBottom:12, textTransform:"uppercase" },
  barRow:      { marginBottom:14 },
  barLabel:    { fontSize:12, fontWeight:600, color:G.navy, marginBottom:4 },
  barTrack:    { background:G.pale, borderRadius:4, height:24, position:"relative", overflow:"visible" },
  barFill:     { background:`linear-gradient(90deg,${G.primary},${G.steel})`, borderRadius:4, height:"100%", minWidth:4, transition:"width 0.5s" },
  barValue:    { position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", fontSize:11, fontWeight:600, color:G.navy },
  barMeta:     { display:"flex", gap:6, marginTop:4, flexWrap:"wrap" },
  pill:        { borderRadius:10, padding:"2px 8px", fontSize:10, fontWeight:600 },
};

/* ── Portal styles ── */
const s = {
  page:         { minHeight:"100vh", background:"#f0f2f5", fontFamily:"'Segoe UI',Arial,sans-serif", fontSize:13 },
  shell:        { display:"flex", minHeight:"100vh" },
  sidebar:      { width:260, background:G.navy, color:"#fff", display:"flex", flexDirection:"column", padding:"0 0 16px", flexShrink:0 },
  sideHeader:   { padding:"20px 20px 8px", borderBottom:"1px solid rgba(255,255,255,0.15)" },
  portalLabel:  { fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.7)", letterSpacing:1, textTransform:"uppercase", padding:"8px 20px 12px" },
  sideSection:  { fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.45)", letterSpacing:1.5, padding:"10px 20px 6px" },
  navItem:      { margin:"2px 12px", padding:"9px 12px", borderRadius:6, cursor:"pointer", fontSize:13, color:"rgba(255,255,255,0.8)" },
  navItemActive:{ background:"rgba(255,255,255,0.2)", color:"#fff", fontWeight:600 },
  sideLoading:  { fontSize:11, color:"rgba(255,255,255,0.4)", padding:"8px 20px" },
  mrCard:       { margin:"2px 12px", padding:"10px 12px", borderRadius:6, cursor:"pointer" },
  mrCardActive: { background:"rgba(255,255,255,0.15)" },
  mrCardTop:    { display:"flex", justifyContent:"space-between", alignItems:"center" },
  mrCardId:     { fontWeight:700, fontSize:12, color:"#fff" },
  docBadge:     { fontSize:10, color:"rgba(255,255,255,0.7)", background:"rgba(255,255,255,0.15)", borderRadius:10, padding:"1px 7px" },
  mrCardMeta:   { fontSize:11, color:"rgba(255,255,255,0.65)", marginTop:3 },
  badge:        { display:"inline-block", marginTop:5, fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10 },
  sideFooter:   { marginTop:"auto", padding:"16px 20px 0", borderTop:"1px solid rgba(255,255,255,0.1)", display:"flex", flexDirection:"column", gap:8 },
  pendingNote:  { fontSize:11, color:"rgba(255,255,255,0.5)" },
  refreshBtn:   { background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", borderRadius:4, padding:"6px 14px", fontSize:12, cursor:"pointer" },
  logoutBtn:    { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.15)", color:"#fff", borderRadius:4, padding:"6px 14px", fontSize:12, cursor:"pointer" },
  topBar:        { display:"flex", alignItems:"center", gap:10, marginBottom:20, padding:"4px 0", justifyContent:"space-between" },
  main:         { flex:1, padding:"28px 32px", overflowY:"auto" },
  pageTitle:    { fontWeight:700, fontSize:18, color:G.navy, marginBottom:20, paddingBottom:12, borderBottom:`2px solid ${G.primary}` },
  emptyState:   { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"60vh" },
  table:        { width:"100%", borderCollapse:"collapse", fontSize:12 },
  th:           { background:G.navy, color:"#fff", padding:"8px 10px", textAlign:"left", fontWeight:600, fontSize:11 },
  trEven:       { background:"#fff" },
  trOdd:        { background:G.pale },
  td:           { padding:"7px 10px", borderBottom:`1px solid ${G.paleBorder}` },
  pill:         { borderRadius:10, padding:"2px 10px", fontSize:11, fontWeight:700 },
  decisionPanel:{ background:"#fafbfc", border:`1px solid ${G.paleBorder}`, borderRadius:8, padding:"20px 24px", marginTop:16 },
  panelTitle:   { fontWeight:700, fontSize:13, color:"#333", marginBottom:14, textTransform:"uppercase", letterSpacing:0.5 },
  revertBlock:  { background:"#fff8e1", border:"1px solid #ffe082", borderRadius:6, padding:"12px 16px", marginBottom:16 },
  revertLabel:  { fontSize:13, color:"#5d4037", marginBottom:10 },
  revertBtn:    { background:"#f57f17", color:"#fff", border:"none", borderRadius:5, padding:"8px 20px", fontSize:12, fontWeight:700, cursor:"pointer" },
  escalateBlock:{ background:"#f3e5f5", border:"1px solid #ce93d8", borderRadius:6, padding:"12px 16px", marginBottom:12 },
  escalateLabel:{ fontWeight:600, fontSize:12, color:"#4a148c", marginBottom:8 },
  escalateBtn:  { marginTop:8, background:"#7b1fa2", color:"#fff", border:"none", borderRadius:5, padding:"8px 20px", fontSize:12, fontWeight:700, cursor:"pointer" },
  divider:      { borderTop:"1px dashed #e0e0e0", margin:"16px 0" },
  rejectBlock:  { marginBottom:16 },
  rejectLabel:  { display:"block", fontWeight:600, fontSize:12, color:"#333", marginBottom:6 },
  required:     { fontWeight:400, color:G.danger, fontSize:11 },
  textarea:     { width:"100%", border:`1px solid ${G.paleBorder}`, borderRadius:4, padding:"8px 10px", fontSize:13, resize:"vertical", outline:"none", boxSizing:"border-box" },
  hint:         { fontWeight:400, color:G.muted, fontSize:11 },
  actionBtns:   { display:"flex", gap:12 },
  approveBtn:   { background:"#1a7a4a", color:"#fff", border:"none", borderRadius:5, padding:"10px 28px", fontSize:13, fontWeight:700, cursor:"pointer" },
  rejectBtn:    { background:G.danger, color:"#fff", border:"none", borderRadius:5, padding:"10px 28px", fontSize:13, fontWeight:700, cursor:"pointer" },
};