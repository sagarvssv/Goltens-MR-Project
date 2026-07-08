import { useState, useEffect } from "react";
import { submitMR, getUploadUrl, uploadFileToS3, listMRs } from "./api";
import GoltensLogo from "./GoltensLogo";
import MRStageTracker from "./MRStageTracker";
import { G } from "./theme";
import NotificationBell from "./NotificationBell";
import SLABadge, { getSLADays } from "./SLABadge";
import { downloadMRWithDocs } from "./downloadPDF";
import HelpChatbot from "./HelpChatbot";

const UOM_OPTIONS = ["Pcs", "Nos", "Set", "Lot", "Kg", "Ltr", "Mtr", "Box"];
const emptyItem   = () => ({ id: Date.now() + Math.random(), item_code: "", description: "", qty: "", uom: "", activity_code: "", estimated_cost: "", budgeted: "" });
const today       = () => new Date().toISOString().split("T")[0];

async function call(action, data = {}) {
  const res = await fetch("/invoke", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data }) });
  if (!res.ok) throw new Error(`API call failed: ${res.status}`);
  return res.json();
}

const statusColor = (st) => {
  if (st === "APPROVED" || st === "ISSUED") return { background: G.successBg, color: G.success };
  if (st === "REJECTED")    return { background: G.dangerBg,  color: G.danger  };
  if (st === "IN_PROCESS")  return { background: G.warningBg, color: G.warning };
  if (st === "PENDING_HOD") return { background: G.purpleBg,  color: G.purple  };
  return { background: G.pale, color: G.primary };
};

export default function MRForm({ session, managerEmail, hodEmail, approvalSlab, formType="material_requisition", onLogout, onBack, isEmbedded }) {
  const [view, setView]             = useState("form");
  const [mrNo, setMrNo]             = useState("");
  const [vessel, setVessel]         = useState("");
  const [department, setDepartment] = useState(session?.department || "");
  const [jobNo, setJobNo]           = useState("");
  const [dateRequested]             = useState(today());
  const [dateRequired, setDateRequired] = useState("");
  const [purpose, setPurpose]           = useState("");
  const [items, setItems]           = useState([emptyItem()]);
  const [docFiles, setDocFiles]     = useState([]);       // File objects yet to upload
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [dupWarning, setDupWarning]   = useState(null);
  const [errors, setErrors]         = useState({});
  const [myMRs, setMyMRs]           = useState([]);
  const [loadingMRs, setLoadingMRs] = useState(false);
  const [expandedMR, setExpandedMR] = useState(null);

  const [requestedBy, setRequestedBy] = useState({ name: session?.name || "", signature: "", id_no: session?.id_no || "" });
  useEffect(() => {
    setRequestedBy(p => ({ ...p, name: p.name || session?.name || "", id_no: p.id_no || session?.id_no || "" }));
    setDepartment(d => d || session?.department || "");
  }, [session]);

  // Load user's MRs on mount and auto-refresh every 30s
  useEffect(() => {
    loadMyMRs();
    const t = setInterval(loadMyMRs, 120000);
    return () => clearInterval(t);
  }, []);

  const [approvedBy, setApprovedBy] = useState({ name: "", signature: "", id_no: "" });
  const [receivedBy, setReceivedBy] = useState({ name: "", signature: "", id_no: "" });
  const [issuedTo, setIssuedTo]     = useState({ name: "", signature: "", id_no: "" });

  const updateItem = (id, f, v) => setItems(p => p.map(it => it.id === id ? { ...it, [f]: v } : it));
  const addRow     = () => setItems(p => [...p, emptyItem()]);
  const removeRow  = (id) => { if (items.length > 1) setItems(p => p.filter(it => it.id !== id)); };

  const totalCost = items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.estimated_cost) || 0), 0);
  const needsHOD  = totalCost > approvalSlab;

  const validate = () => {
    const e = {};
    if (!vessel.trim()) e.vessel = "Required";
    if (!department.trim()) e.department = "Required";
    if (!jobNo.trim()) e.jobNo = "Required";
    if (!dateRequired) e.dateRequired = "Required";
    if (!purpose.trim()) e.purpose = "Required";
    if (!requestedBy.name.trim()) e.requestedByName = "Required";
    if (!items.some(it => it.description.trim())) e.items = "At least one item is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const loadMyMRs = async () => {
    setLoadingMRs(true);
    try {
      const all = await listMRs("ALL");
      setMyMRs((all || []).filter(m => m.submitted_by_email === session.email));
    } catch {}
    setLoadingMRs(false);
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    // Duplicate detection — check for same vessel + job number submitted in last 30 days
    if (myMRs.length > 0 && vessel.trim() && jobNo.trim()) {
      const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const dup = myMRs.find(m =>
        m.vessel?.toLowerCase() === vessel.toLowerCase() &&
        m.job_no?.toLowerCase() === jobNo.toLowerCase() &&
        new Date(m.created_at).getTime() > cutoff &&
        m.status !== "REJECTED"
      );
      if (dup && !dupWarning) {
        setDupWarning(dup);
        return; // pause — let user confirm
      }
    }
    setDupWarning(null);
    setSubmitting(true); setSubmitError("");
    try {
      const reserved = await call("reserve_mr_id", {});
      const rid = reserved?.mr_id;
      if (!rid) throw new Error("Could not reserve MR ID");
      setMrNo(rid);

      // Upload documents
      const s3Keys = [];
      for (const file of docFiles) {
        try {
          const urlData = await getUploadUrl(file.name, file.type, rid);
          if (urlData?.s3_key) { await uploadFileToS3(urlData.s3_key, file); s3Keys.push(urlData.s3_key); }
        } catch (e) { console.warn("Upload failed:", e); }
      }

      const validItems = items.filter(it => it.description.trim()).map(({ id, ...rest }) => rest);
      const result = await submitMR({
        mr_id: rid, vessel, department, job_no: jobNo, date_required: dateRequired,
        submitted_by_name: requestedBy.name, submitted_by_email: session.email,
        submitted_by_id_no: requestedBy.id_no, manager_email: managerEmail,
        hod_email: hodEmail, approval_slab: approvalSlab,
        items: validItems, document_s3_keys: s3Keys, needs_hod_approval: needsHOD, form_type: formType, purpose: purpose,
      });

      if (result?.success === false) { setSubmitError(result.error || "Submission failed."); setSubmitting(false); return; }
      setSubmitted(true);
    } catch (err) { setSubmitError("Could not connect to the server. Please try again."); console.error(err); }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div style={s.successWrap}>
        <div style={s.successCard}>
          <GoltensLogo size="lg" style={{ justifyContent: "center", marginBottom: 20 }} />
          <div style={s.successIcon}>✓</div>
          <h2 style={s.successTitle}>MR Submitted Successfully</h2>
          <p style={s.successMrNo}>{mrNo}</p>
          {needsHOD && <div style={s.hodNote}>⚠ Total exceeds AED {approvalSlab.toLocaleString()} — requires Manager + HOD approval.</div>}
          <p style={s.successSub}>Confirmation sent to <strong>{session.email}</strong>.<br />Manager has been notified for approval.</p>
          <button style={s.newBtn} onClick={() => window.location.reload()}>Submit Another MR</button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.formCard}>
        {/* Top bar */}
        {!isEmbedded && (
          <div style={s.topBar}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={s.roleTag}>👤 {session.name || session.email}</span>
              {onBack && <button style={s.backBtn} onClick={onBack}>← Forms</button>}
              <NotificationBell mrs={myMRs} role="user" userEmail={session?.email} accentColor={G.primary}/>
              <button style={{ ...s.navBtn, ...(view === "form" ? s.navBtnActive : {}) }} onClick={() => setView("form")}>Submit MR</button>
              <button style={{ ...s.navBtn, ...(view === "status" ? s.navBtnActive : {}) }} onClick={() => { setView("status"); loadMyMRs(); }}>My MR Status</button>
            </div>
            <button style={s.logoutBtn} onClick={onLogout}>Log Out</button>
          </div>
        )}

        {/* ── STATUS VIEW ── */}
        {view === "status" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={s.sectionTitle}>My Submitted MRs</div>
              <button style={{background:G.pale,border:`1px solid ${G.paleBorder}`,borderRadius:5,padding:"5px 12px",fontSize:12,cursor:"pointer",color:G.navy,fontWeight:600}} onClick={loadMyMRs}>
                {loadingMRs ? "Loading…" : "↻ Refresh"}
              </button>
            </div>
            {loadingMRs ? <div style={{ color: G.muted, padding: 20 }}>Loading…</div>
            : myMRs.length === 0 ? <div style={{ color: "#aaa", padding: 20 }}>No MRs submitted yet.</div>
            : myMRs.map((mr, i) => (
              <div key={mr.mr_id} style={s.mrStatusCard}>
                {/* Summary row */}
                <div style={s.mrStatusHeader} onClick={() => setExpandedMR(expandedMR === mr.mr_id ? null : mr.mr_id)}>
                  <div>
                    <div style={s.mrStatusId}>{mr.mr_id}</div>
                    <div style={s.mrStatusMeta}>{mr.vessel} · {mr.job_no} · {mr.date_requested}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ ...s.statusPill, ...statusColor(mr.status) }}>{mr.status?.replace(/_/g, " ")}</span>
                    <span style={{ color: G.muted, fontSize: 11 }}>{expandedMR === mr.mr_id ? "▲ less" : "▼ more"}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedMR === mr.mr_id && mr && (
                  <div style={s.mrStatusDetail}>
                    <MRStageTracker status={mr.status} />
                    <SLABadge mr={mr}/>
                    <button style={{background:G.primary,color:"#fff",border:"none",borderRadius:5,padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",marginBottom:12}} onClick={()=>downloadMRWithDocs(mr)}>⬇ Download PDF</button>

                    {/* Key info */}
                    <div style={s.detailGrid}>
                      {[
                        ["Total Cost", `AED ${parseFloat(mr.total_cost||0).toLocaleString("en-AE",{minimumFractionDigits:2})}`],
                        ["Date Required", mr.date_required],
                        ["Department", mr.department||"—"],
                        ["Approval Level", mr.needs_hod_approval ? "Manager + HOD" : "Manager only"],
                      ].map(([k,v]) => (
                        <div key={k} style={s.detailCell}>
                          <div style={s.detailLabel}>{k}</div>
                          <div style={s.detailValue}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Status messages */}
                    {mr.status === "PENDING" && (
                      <div style={s.statusNote}>📋 Your MR is awaiting Manager review.</div>
                    )}
                    {mr.status === "PENDING_HOD" && (
                      <div style={s.statusNoteHOD}>🔺 Manager approved. Awaiting GM/HOD second-level approval.</div>
                    )}
                    {mr.status === "APPROVED" && (
                      <div style={s.statusNoteOk}>✓ Approved by {mr.hod_approved_by || mr.approved_by || "manager"}. Sent to Supply Chain.</div>
                    )}
                    {mr.status === "REJECTED" && (
                      <div style={s.statusNoteErr}>✕ Rejected by {mr.rejected_by}. Reason: {mr.rejection_reason}</div>
                    )}
                    {mr.status === "IN_PROCESS" && (
                      <div style={s.statusNoteWarn}>⏳ In Process — {mr.inprocess_note}</div>
                    )}
                    {mr.status === "ISSUED" && (
                      <div style={s.statusNoteOk}>✓ Items issued to {mr.warehouse_issued_to_name || "warehouse"}.</div>
                    )}
                    {mr.warehouse_collection_comment && (
                      <div style={s.scNote}>Supply Chain Note: {mr.warehouse_collection_comment}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── FORM VIEW ── */}
        {view === "form" && (<>
          {/* Header */}
          <div style={s.headerRow}>
            <GoltensLogo size="md" />
            <div style={s.titleArea}>
              <div style={s.formTitle}>MATERIAL REQUISITION / STORE ISSUE</div>
              <div style={s.mrNoRow}><span style={s.mrNoLabel}>No.</span><span style={s.mrNo}>{mrNo || "—"}</span></div>
            </div>
          </div>

          {/* Purpose / Description section */}
          <div style={s.purposeSection}>
            <div style={s.purposeLeft}>
              <div style={s.purposeHeading}>Purpose</div>
              <div style={s.purposeSubtext}>Describe the reason for this material requisition request</div>
            </div>
            <div style={s.purposeRight}>
              <textarea
                style={{ ...s.purposeBox, ...(errors.purpose ? { border:`1.5px solid ${G.danger}` } : {}) }}
                rows={3}
                placeholder="e.g. Required for scheduled maintenance of Al Marjan vessel engine — Job J-2025-014. Items needed before 15th July to avoid operational delay."
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
              />
              {errors.purpose && <span style={{ color:G.danger, fontSize:11 }}>Purpose is required</span>}
            </div>
          </div>

          {needsHOD && <div style={s.hodWarning}>⚠ Total AED {totalCost.toLocaleString("en-AE",{minimumFractionDigits:2})} exceeds AED {approvalSlab.toLocaleString()} — requires Manager + HOD two-level approval.</div>}

          {/* Top Fields */}
          <div style={s.topFields}>
            {[
              { label:"Vessel",     val:vessel,     set:setVessel,     err:errors.vessel,       ph:"Enter vessel name"   },
              { label:"Department", val:department, set:setDepartment, err:errors.department,   ph:"Enter department"    },
              { label:"Job No.",    val:jobNo,       set:setJobNo,      err:errors.jobNo,        ph:"Enter job number", hint:"Project Details" },
              { label:"Date Requested", val:dateRequested, readonly:true },
              { label:"Date Required",  val:dateRequired,  set:setDateRequired, err:errors.dateRequired, type:"date" },
            ].map(({ label, hint, val, set, err, ph, readonly, type }) => (
              <div key={label} style={s.fieldGroup}>
                <label style={s.label}>{label}{hint && <span style={s.hint}> ({hint})</span>}</label>
                <input type={type||"text"} style={{ ...s.input, ...(err ? s.inputErr : {}), ...(readonly ? s.inputReadonly : {}) }}
                  placeholder={ph} value={val} readOnly={readonly}
                  onChange={e => set && set(e.target.value)} />
                {err && <span style={s.errMsg}>{err}</span>}
              </div>
            ))}
          </div>

          {/* Items Table */}
          <div style={s.tableWrap}>
            {errors.items && <div style={s.errMsg}>{errors.items}</div>}
            <table style={s.table}>
              <thead><tr>{["S.N.","Item Code","Description","Qty.","U.O.M","Activity Code","Est. Cost (AED)","Budgeted",""].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id} style={idx % 2 === 0 ? s.trEven : s.trOdd}>
                    <td style={{ ...s.td, textAlign:"center", width:36 }}>{idx+1}</td>
                    <td style={s.td}><input style={s.cellInput} placeholder="000" value={it.item_code} onChange={e=>updateItem(it.id,"item_code",e.target.value)}/></td>
                    <td style={{ ...s.td, minWidth:200 }}><input style={s.cellInput} placeholder="Item description" value={it.description} onChange={e=>updateItem(it.id,"description",e.target.value)}/></td>
                    <td style={s.td}><input style={{ ...s.cellInput, width:60 }} type="number" min="0" placeholder="0" value={it.qty} onChange={e=>updateItem(it.id,"qty",e.target.value)}/></td>
                    <td style={s.td}><select style={s.cellSelect} value={it.uom} onChange={e=>updateItem(it.id,"uom",e.target.value)}><option value="">—</option>{UOM_OPTIONS.map(u=><option key={u}>{u}</option>)}</select></td>
                    <td style={s.td}><input style={{ ...s.cellInput, width:90 }} placeholder="AC-001" value={it.activity_code} onChange={e=>updateItem(it.id,"activity_code",e.target.value)}/></td>
                    <td style={s.td}><input style={{ ...s.cellInput, width:90 }} type="number" min="0" placeholder="0.00" value={it.estimated_cost} onChange={e=>updateItem(it.id,"estimated_cost",e.target.value)}/></td>
                    <td style={s.td}><select style={s.cellSelect} value={it.budgeted} onChange={e=>updateItem(it.id,"budgeted",e.target.value)}><option value="">—</option><option>Yes</option><option>No</option></select></td>
                    <td style={{ ...s.td, textAlign:"center" }}><button style={s.removeBtn} onClick={()=>removeRow(it.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={s.tableFooter}>
              <button style={s.addRowBtn} onClick={addRow}>+ Add Row</button>
              <div style={s.totalRow}>
                <span style={s.totalLabel}>Total Estimated Cost:</span>
                <span style={{ ...s.totalValue, color: needsHOD ? G.danger : G.primary }}>
                  AED {totalCost.toLocaleString("en-AE",{minimumFractionDigits:2})}
                </span>
              </div>
            </div>
          </div>

          {/* Supporting Docs — with remove option */}
          <div style={s.docRow}>
            <label style={s.label}>Supporting Documents <span style={s.hint}>(optional — images or PDF)</span></label>
            <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xlsx"
              style={s.fileInput}
              onChange={e => setDocFiles(prev => [...prev, ...Array.from(e.target.files)])} />
            {docFiles.length > 0 && (
              <div style={s.fileList}>
                {docFiles.map((f, i) => (
                  <div key={i} style={s.fileChip}>
                    <span>{f.type.startsWith("image/") ? "🖼️" : "📄"}</span>
                    <span>{f.name}</span>
                    <span style={{ color: G.muted, fontSize: 11 }}>({(f.size/1024).toFixed(1)} KB)</span>
                    <button style={s.removeDocBtn} title="Remove"
                      onClick={() => setDocFiles(prev => prev.filter((_, idx) => idx !== i))}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Signatories */}
          <div style={s.signatoryGrid}>
            {[
              { title:"Requested By",    state:requestedBy, setter:setRequestedBy, autofilled:!!(session?.name), errKey:"requestedByName" },
              { title:"Approved By",     state:approvedBy,  setter:setApprovedBy  },
              { title:"M.R. Received By",state:receivedBy,  setter:setReceivedBy  },
              { title:"Items Issued To", state:issuedTo,    setter:setIssuedTo    },
            ].map(({ title, state, setter, autofilled, errKey }) => (
              <div key={title} style={s.sigBox}>
                <div style={s.sigTitle}>{title}{autofilled && <span style={s.autoTag}>auto-filled</span>}</div>
                {["name","signature","id_no"].map(field => (
                  <div key={field} style={s.sigField}>
                    <label style={s.sigLabel}>{field === "id_no" ? "ID No." : field.charAt(0).toUpperCase()+field.slice(1)}</label>
                    <input style={{ ...s.sigInput, ...(autofilled && field !== "signature" ? s.sigInputLocked : {}), ...(errKey && field==="name" && errors[errKey] ? s.inputErr : {}) }}
                      value={state[field]} placeholder={field === "id_no" ? "ID number" : field.charAt(0).toUpperCase()+field.slice(1)}
                      onChange={e => setter(p => ({ ...p, [field]: e.target.value }))} />
                    {errKey && field==="name" && errors[errKey] && <span style={s.errMsg}>{errors[errKey]}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={s.copyNote}>
            White — Accounts &nbsp;|&nbsp; Yellow — Purchase &nbsp;|&nbsp; Blue — Originator
            &nbsp;·&nbsp; Item issued by supply chain &nbsp;·&nbsp; FO-552-0201, Rev.06 (Jan 18)
          </div>

          {dupWarning && (
            <div style={{...s.submitErr, background:"#fff8e1", borderColor:"#ffe082", color:"#b8860b"}}>
              ⚠ <strong>Possible Duplicate:</strong> You already submitted MR <strong>{dupWarning.mr_id}</strong> for vessel <strong>{dupWarning.vessel}</strong> Job <strong>{dupWarning.job_no}</strong> ({dupWarning.status?.replace(/_/g," ")}).
              <div style={{marginTop:8,display:"flex",gap:8}}>
                <button style={{background:"#b8860b",color:"#fff",border:"none",borderRadius:4,padding:"5px 14px",fontSize:12,cursor:"pointer"}} onClick={handleSubmit}>Submit Anyway</button>
                <button style={{background:G.pale,color:G.navy,border:`1px solid ${G.paleBorder}`,borderRadius:4,padding:"5px 14px",fontSize:12,cursor:"pointer"}} onClick={()=>setDupWarning(null)}>Cancel</button>
              </div>
            </div>
          )}
          {submitError && <div style={s.submitErr}>{submitError}</div>}
          <div style={s.submitRow}>
            <button style={{ ...s.submitBtn, ...(submitting ? {opacity:0.7} : {}) }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting & Uploading…" : "Submit Material Requisition"}
            </button>
          </div>
        </>)}
      </div>
    <HelpChatbot role="user" userName={session?.name} userEmail={session?.email} />
    </div>
  );
}

const s = {
  page:           { minHeight:"100vh", background:`linear-gradient(160deg, ${G.pale} 0%, #f0f4f8 100%)`, padding:"24px 16px", fontFamily:"'Inter', 'Segoe UI', system-ui, Arial, sans-serif", fontSize:13 },
  formCard:       { maxWidth:1100, margin:"0 auto", background:G.white, borderRadius:12, boxShadow:`0 4px 24px ${G.primary}22`, padding:"24px 32px 28px", border:`1px solid ${G.paleBorder}` },
  topBar:         { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, paddingBottom:16, borderBottom:`2px solid ${G.pale}` },
  roleTag:        { background:G.pale, color:G.navy, borderRadius:20, padding:"4px 14px", fontSize:12, fontWeight:600, border:`1px solid ${G.paleBorder}` },
  backBtn:        { background:G.pale, border:`1px solid ${G.paleBorder}`, borderRadius:5, padding:"5px 14px", fontSize:12, cursor:"pointer", color:G.navy, fontWeight:600 },
  navBtn:         { background:"none", border:`1px solid ${G.paleBorder}`, borderRadius:5, padding:"5px 14px", fontSize:12, cursor:"pointer", color:G.muted },
  navBtnActive:   { background:G.primary, color:G.white, border:`1px solid ${G.primary}` },
  logoutBtn:      { background:"none", border:`1px solid ${G.paleBorder}`, borderRadius:5, padding:"5px 14px", fontSize:12, cursor:"pointer", color:G.muted },
  sectionTitle:   { fontWeight:700, fontSize:15, color:G.navy, marginBottom:16, paddingBottom:8, borderBottom:`2px solid ${G.primary}` },
  // Status view
  mrStatusCard:   { border:`1px solid ${G.paleBorder}`, borderRadius:8, marginBottom:12, overflow:"hidden" },
  mrStatusHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", cursor:"pointer", background:G.pale },
  mrStatusId:     { fontWeight:700, color:G.navy, fontSize:13 },
  mrStatusMeta:   { fontSize:11, color:G.muted, marginTop:3 },
  mrStatusDetail: { padding:"16px", borderTop:`1px solid ${G.paleBorder}` },
  statusPill:     { borderRadius:10, padding:"2px 10px", fontSize:11, fontWeight:700 },
  detailGrid:     { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginTop:12, marginBottom:12 },
  detailCell:     { background:"#f7f9fc", border:`1px solid ${G.paleBorder}`, borderRadius:6, padding:"8px 12px" },
  detailLabel:    { fontSize:10, color:G.muted, fontWeight:600, textTransform:"uppercase", marginBottom:3 },
  detailValue:    { fontSize:12, fontWeight:700, color:G.navy },
  statusNote:     { background:"#eaf1fb", border:`1px solid ${G.paleBorder}`, borderRadius:5, padding:"8px 12px", fontSize:12, color:G.primary, marginTop:8 },
  statusNoteHOD:  { background:"#f3e5f5", border:"1px solid #ce93d8", borderRadius:5, padding:"8px 12px", fontSize:12, color:"#7b1fa2", marginTop:8 },
  statusNoteOk:   { background:G.successBg, border:"1px solid #a5d6a7", borderRadius:5, padding:"8px 12px", fontSize:12, color:G.success, marginTop:8 },
  statusNoteErr:  { background:G.dangerBg, border:"1px solid #f5c6c6", borderRadius:5, padding:"8px 12px", fontSize:12, color:G.danger, marginTop:8 },
  statusNoteWarn: { background:G.warningBg, border:"1px solid #ffe082", borderRadius:5, padding:"8px 12px", fontSize:12, color:G.warning, marginTop:8 },
  scNote:         { background:"#e8f5e9", border:"1px solid #a5d6a7", borderRadius:5, padding:"8px 12px", fontSize:12, color:G.success, marginTop:8 },
  // Form
  purposeSection: { display:"flex", gap:20, marginBottom:20, background:G.pale, border:`1px solid ${G.paleBorder}`, borderRadius:8, padding:"16px 18px" },
  purposeLeft:    { minWidth:160, flexShrink:0 },
  purposeHeading: { fontWeight:700, color:G.navy, fontSize:13, marginBottom:4 },
  purposeSubtext: { fontSize:11, color:G.muted, lineHeight:1.5 },
  purposeRight:   { flex:1 },
  purposeBox:     { width:"100%", border:`1.5px solid ${G.paleBorder}`, borderRadius:6, padding:"9px 12px", fontSize:13, resize:"vertical", outline:"none", boxSizing:"border-box", fontFamily:"'Inter','Segoe UI',Arial,sans-serif", lineHeight:1.5 },
  hodWarning:     { background:G.warningBg, border:"1px solid #ffe082", borderRadius:6, padding:"10px 14px", fontSize:12, color:G.warning, marginBottom:16 },
  headerRow:      { display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`2.5px solid ${G.primary}`, paddingBottom:16, marginBottom:20 },
  titleArea:      { textAlign:"right" },
  formTitle:      { fontWeight:700, fontSize:15, color:G.navy, textTransform:"uppercase", letterSpacing:1.2 },
  mrNoRow:        { marginTop:6, display:"flex", alignItems:"baseline", gap:8, justifyContent:"flex-end" },
  mrNoLabel:      { fontSize:12, color:G.muted },
  mrNo:           { fontSize:22, fontWeight:800, color:"#c0392b", letterSpacing:2 },
  topFields:      { display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:"12px 20px", marginBottom:20 },
  fieldGroup:     { display:"flex", flexDirection:"column", gap:4 },
  label:          { fontWeight:600, color:G.navy, fontSize:12 },
  hint:           { fontWeight:400, color:G.muted, fontSize:11 },
  input:          { border:`1.5px solid ${G.paleBorder}`, borderRadius:5, padding:"7px 10px", fontSize:13, outline:"none" },
  inputReadonly:  { background:"#f5f7f9", color:G.muted },
  inputErr:       { border:`1.5px solid ${G.danger}` },
  errMsg:         { color:G.danger, fontSize:11, marginTop:2 },
  tableWrap:      { overflowX:"auto", marginBottom:16 },
  table:          { width:"100%", borderCollapse:"collapse", fontSize:12 },
  th:             { background:G.navy, color:"#fff", padding:"9px 10px", textAlign:"left", fontWeight:600, fontSize:11, whiteSpace:"nowrap" },
  trEven:         { background:G.white },
  trOdd:          { background:G.pale },
  td:             { padding:"5px 7px", borderBottom:`1px solid ${G.paleBorder}`, verticalAlign:"middle" },
  cellInput:      { border:`1px solid ${G.paleBorder}`, borderRadius:3, padding:"4px 7px", fontSize:12, width:"100%", outline:"none", background:"transparent", boxSizing:"border-box" },
  cellSelect:     { border:`1px solid ${G.paleBorder}`, borderRadius:3, padding:"4px", fontSize:12, background:"transparent", outline:"none" },
  removeBtn:      { background:"none", border:"none", color:"#bbb", fontSize:18, cursor:"pointer" },
  tableFooter:    { display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10 },
  addRowBtn:      { background:G.pale, color:G.primary, border:`1px solid ${G.paleBorder}`, borderRadius:5, padding:"6px 16px", fontSize:12, fontWeight:600, cursor:"pointer" },
  totalRow:       { display:"flex", alignItems:"center", gap:12 },
  totalLabel:     { fontWeight:600, color:G.muted, fontSize:13 },
  totalValue:     { fontWeight:800, fontSize:16 },
  docRow:         { marginBottom:20 },
  fileInput:      { marginTop:6, fontSize:12, display:"block" },
  fileList:       { marginTop:10, display:"flex", flexWrap:"wrap", gap:8 },
  fileChip:       { display:"flex", alignItems:"center", gap:6, background:G.pale, border:`1px solid ${G.paleBorder}`, borderRadius:20, padding:"4px 12px", fontSize:12 },
  removeDocBtn:   { background:"none", border:"none", color:G.danger, fontSize:16, cursor:"pointer", fontWeight:700, lineHeight:1, padding:"0 2px" },
  signatoryGrid:  { display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:16, borderTop:`1px solid ${G.paleBorder}`, paddingTop:16 },
  sigBox:         { border:`1px solid ${G.paleBorder}`, borderRadius:8, padding:"12px 14px", background:G.pale },
  sigTitle:       { fontWeight:700, color:G.navy, fontSize:12, marginBottom:10, display:"flex", alignItems:"center", gap:6 },
  autoTag:        { background:G.successBg, color:G.success, fontSize:9, fontWeight:600, padding:"1px 6px", borderRadius:10 },
  sigField:       { marginBottom:8 },
  sigLabel:       { display:"block", fontSize:11, color:G.muted, marginBottom:3 },
  sigInput:       { width:"100%", border:"none", borderBottom:`1px solid ${G.paleBorder}`, background:"transparent", fontSize:12, padding:"3px 0", outline:"none", boxSizing:"border-box" },
  sigInputLocked: { color:G.primary, fontWeight:600, borderBottomColor:G.light },
  copyNote:       { fontSize:10, color:G.muted, borderTop:`1px solid ${G.paleBorder}`, paddingTop:10, marginBottom:16 },
  submitErr:      { background:G.dangerBg, color:G.danger, border:"1px solid #f5c6c6", borderRadius:5, padding:"10px 14px", fontSize:12, marginBottom:14 },
  submitRow:      { display:"flex", justifyContent:"flex-end" },
  submitBtn:      { background:`linear-gradient(135deg, ${G.primary}, ${G.navy})`, color:G.white, border:"none", borderRadius:6, padding:"12px 36px", fontSize:14, fontWeight:700, cursor:"pointer" },
  successWrap:    { minHeight:"100vh", background:`linear-gradient(135deg, ${G.navy}, ${G.primary})`, display:"flex", alignItems:"center", justifyContent:"center" },
  successCard:    { background:G.white, borderRadius:12, padding:"48px 56px", textAlign:"center", boxShadow:"0 8px 32px rgba(0,0,0,0.2)", maxWidth:480 },
  successIcon:    { width:64, height:64, background:`linear-gradient(135deg, ${G.primary}, ${G.navy})`, borderRadius:"50%", color:G.white, fontSize:32, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" },
  successTitle:   { fontSize:22, fontWeight:700, color:G.navy, marginBottom:8 },
  successMrNo:    { fontSize:18, fontWeight:800, color:"#c0392b", marginBottom:12 },
  hodNote:        { background:G.warningBg, border:"1px solid #ffe082", borderRadius:6, padding:"8px 14px", fontSize:12, color:G.warning, marginBottom:12 },
  successSub:     { fontSize:13, color:G.muted, marginBottom:24, lineHeight:1.7 },
  newBtn:         { background:`linear-gradient(135deg, ${G.primary}, ${G.navy})`, color:G.white, border:"none", borderRadius:6, padding:"11px 32px", fontSize:13, fontWeight:700, cursor:"pointer" },
};