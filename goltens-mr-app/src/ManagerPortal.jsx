import { useState, useEffect } from "react";
import { listMRs, approveMR, rejectMR, markInProcessMR } from "./api";
import MRDetailView from "./MRDetailView";
import MRForm from "./MRForm";
import GoltensLogo from "./GoltensLogo";
import { G } from "./theme";
import FormTypeFilter, { filterByFormType } from "./FormTypeFilter";
import FormSelectionModal from "./FormSelectionModal";
import HelpChatbot from "./HelpChatbot";
import { HOD_EMAIL, APPROVAL_SLAB } from "./App";

async function call(action,data={}) {
  const res=await fetch("/invoke",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,data})});
  if(!res.ok) throw new Error(`${res.status}`); return res.json();
}

function downloadMRPDF(mr) {
  const win = window.open("","_blank");
  win.document.write(`<html><head><title>MR ${mr.mr_id}</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}h2{color:#1A3A5C}
  table{width:100%;border-collapse:collapse}th{background:#1A3A5C;color:#fff;padding:6px 8px;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #eee}
  .sig-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px;border-top:1px solid #ccc;padding-top:12px}
  .sig-box{border:1px solid #ccc;padding:8px;border-radius:4px}.sig-title{font-weight:bold;margin-bottom:6px;font-size:11px;color:#1A3A5C}
  </style></head><body>
  <h2>Goltens Co. Ltd. Dubai Branch</h2><h3>Material Requisition — ${mr.mr_id}</h3>
  <p><b>Vessel:</b> ${mr.vessel} &nbsp; <b>Dept:</b> ${mr.department||"—"} &nbsp; <b>Job:</b> ${mr.job_no} &nbsp; <b>Status:</b> ${mr.status?.replace(/_/g," ")}</p>
  <p><b>Date Requested:</b> ${mr.date_requested} &nbsp; <b>Date Required:</b> ${mr.date_required}</p>
  <table><thead><tr><th>S.N.</th><th>Item Code</th><th>Description</th><th>Qty</th><th>UOM</th><th>Activity Code</th><th>Est. Cost</th><th>Budgeted</th></tr></thead>
  <tbody>${(mr.items||[]).map((it,i)=>`<tr><td>${i+1}</td><td>${it.item_code}</td><td>${it.description}</td><td>${it.qty}</td><td>${it.uom}</td><td>${it.activity_code}</td><td>${it.estimated_cost}</td><td>${it.budgeted}</td></tr>`).join("")}</tbody></table>
  <p><b>Total: AED ${parseFloat(mr.total_cost||0).toLocaleString("en-AE",{minimumFractionDigits:2})}</b></p>
  <div class="sig-grid">
    <div class="sig-box"><div class="sig-title">Requested By</div>${mr.submitted_by_name||"—"}</div>
    <div class="sig-box"><div class="sig-title">Approved By</div>${mr.approved_by||"—"}</div>
    <div class="sig-box"><div class="sig-title">MR Received By</div>${mr.sc_received_by_name||"—"}</div>
    <div class="sig-box"><div class="sig-title">Items Issued To</div>${mr.warehouse_issued_to_name||"—"}</div>
  </div></body></html>`);
  win.document.close(); win.print();
}

function Analytics({ mrs }) {
  const projects = {};
  mrs.forEach(mr => {
    const key = mr.job_no || "Unassigned";
    if(!projects[key]) projects[key]={job_no:key,count:0,total:0,pending:0,approved:0,rejected:0,inprocess:0};
    projects[key].count++;
    projects[key].total += parseFloat(mr.total_cost||0);
    if(["PENDING","PENDING_HOD"].includes(mr.status)) projects[key].pending++;
    else if(mr.status==="APPROVED"||mr.status==="ISSUED") projects[key].approved++;
    else if(mr.status==="REJECTED") projects[key].rejected++;
    else if(mr.status==="IN_PROCESS") projects[key].inprocess++;
  });
  const list = Object.values(projects).sort((a,b)=>b.total-a.total);
  const maxTotal = Math.max(...list.map(p=>p.total), 1);
  const totalSpend = mrs.reduce((s,m)=>s+parseFloat(m.total_cost||0),0);
  const statusCounts = {};
  mrs.forEach(m=>{ statusCounts[m.status]=(statusCounts[m.status]||0)+1; });

  return (
    <div>
      <div style={an.grid}>
        {[
          ["Total MRs",   mrs.length,                                                         G.navy],
          ["Total Spend", `AED ${totalSpend.toLocaleString("en-AE",{minimumFractionDigits:2})}`, G.primary],
          ["Pending",     (statusCounts["PENDING"]||0)+(statusCounts["PENDING_HOD"]||0),      "#b8860b"],
          ["Approved",    (statusCounts["APPROVED"]||0)+(statusCounts["ISSUED"]||0),           G.success],
          ["Rejected",    statusCounts["REJECTED"]||0,                                         G.danger],
        ].map(([label,val,color])=>(
          <div key={label} style={an.card}>
            <div style={{...an.val,color}}>{val}</div>
            <div style={an.lbl}>{label}</div>
          </div>
        ))}
      </div>

      <div style={an.sectionTitle}>Spend by Project</div>
      {list.length===0 ? <div style={{color:"#aaa"}}>No MRs yet.</div> : (
        <div>
          {list.map(p=>(
            <div key={p.job_no} style={an.barRow}>
              <div style={an.barLabel}>{"Job No: " + p.job_no}</div>
              <div style={an.barTrack}>
                <div style={{...an.barFill, width:`${(p.total/maxTotal)*100}%`}}/>
                <span style={an.barValue}>AED {p.total.toLocaleString("en-AE",{minimumFractionDigits:0})}</span>
              </div>
              <div style={an.barMeta}>
                <span style={{...an.pill,background:"#eaf1fb",color:G.primary}}>{p.count} MRs</span>
                {p.pending>0  && <span style={{...an.pill,background:"#fff8e1",color:"#b8860b"}}>{p.pending} pending</span>}
                {p.approved>0 && <span style={{...an.pill,background:"#e8f5e9",color:G.success}}>{p.approved} approved</span>}
                {p.rejected>0 && <span style={{...an.pill,background:"#fff5f5",color:G.danger}}>{p.rejected} rejected</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ManagerPortal({ session, onLogout }) {
  const [view, setView]             = useState("queue");
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

  useEffect(()=>{ loadMRs(); const t=setInterval(loadMRs,30000); return()=>clearInterval(t); },[]);
  useEffect(()=>{ if(selected&&mrs.length>0){ const u=mrs.find(m=>m.mr_id===selected.mr_id); if(u)setSelected(u); } },[mrs]);

  const filteredMRs = filterByFormType(mrs, formFilter);
  const openMR = mr => { setSelected(mr); setActionDone(null); setRejComment(""); setRejectErr(""); setEscalateNote(""); };
  const actor  = session.name||session.email;

  const doApprove = async () => {
    setActioning(true);
    const r = await approveMR(selected.mr_id, actor);
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

          <div style={s.sideFooter}>
            <div style={s.pendingNote}>{pendingCount} pending review</div>
            <button style={s.refreshBtn} onClick={loadMRs}>↻ Refresh</button>
            <button style={s.logoutBtn} onClick={onLogout}>Log Out</button>
          </div>
        </div>

        {/* ── Main ── */}
        <div style={s.main}>

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
            <div>
              <div style={s.pageTitle}>All MR Status</div>
              <FormTypeFilter mrs={mrs} selected={formFilter} onChange={setFormFilter} accentColor={G.navy}/>
              {filteredMRs.length===0 ? <div style={{color:"#aaa"}}>No MRs found.</div> : (
                <table style={s.table}>
                  <thead>
                    <tr>{["MR Number","Vessel","Dept","Job No.","Submitted By","Total (AED)","Status"].map(h=>(
                      <th key={h} style={s.th}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {filteredMRs.map((mr,i)=>(
                      <tr key={mr.mr_id}
                        style={{...i%2===0?s.trEven:s.trOdd, cursor:"pointer"}}
                        onClick={()=>{openMR(mr);setView("queue");}}>
                        <td style={s.td}><strong>{mr.mr_id}</strong></td>
                        <td style={s.td}>{mr.vessel}</td>
                        <td style={s.td}>{mr.department||"—"}</td>
                        <td style={s.td}>{mr.job_no}</td>
                        <td style={s.td}>{mr.submitted_by_name}</td>
                        <td style={s.td}>{parseFloat(mr.total_cost||0).toLocaleString("en-AE",{minimumFractionDigits:2})}</td>
                        <td style={s.td}>
                          <span style={{...s.pill,...statusBadgeStyle(mr.status)}}>
                            {mr.status?.replace("_"," ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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
                <MRDetailView mr={selected} showDownload onDownloadPDF={()=>downloadMRPDF(selected)} />

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
