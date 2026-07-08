import { useState, useEffect } from "react";
import { listMRs } from "./api";
import MRDetailView from "./MRDetailView";
import GoltensLogo from "./GoltensLogo";
import SearchBar from "./SearchBar";
import NotificationBell from "./NotificationBell";
import SLABadge, { getSLADays } from "./SLABadge";
import FormTypeFilter, { filterByFormType } from "./FormTypeFilter";
import HelpChatbot from "./HelpChatbot";
import { downloadMRWithDocs } from "./downloadPDF";
import { G } from "./theme";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, FunnelChart, Funnel, LabelList,
} from "recharts";

const SC_TEAM = [
  { name: "Nithya Prabhakar",  email: "nithya.prabhakar@goltens.com", id: "SC-01" },
  { name: "Supply Chain 1",    email: "sc1@goltens.com",               id: "SC-03" },
  { name: "Supply Chain 2",    email: "sc2@goltens.com",               id: "SC-04" },
  { name: "Supply Chain 3",    email: "sc3@goltens.com",               id: "SC-05" },
  { name: "Supply Chain 4",    email: "sc4@goltens.com",               id: "SC-06" },
];

const COLORS = ["#0d6b4e","#1B6CA8","#b8860b","#c0392b","#7b1fa2","#00838f"];

async function call(action, data={}) {
  const res = await fetch("/invoke",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,data})});
  if(!res.ok) throw new Error(`${res.status}`); return res.json();
}

function KPICard({ label, value, sub, color, icon }) {
  return (
    <div style={{ background:"#fff", border:`1px solid ${G.paleBorder}`, borderRadius:10, padding:"18px 20px", borderLeft:`4px solid ${color||G.primary}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:28, fontWeight:800, color: color||G.navy, lineHeight:1 }}>{value}</div>
          <div style={{ fontSize:12, fontWeight:600, color:G.muted, marginTop:4, textTransform:"uppercase", letterSpacing:0.4 }}>{label}</div>
          {sub && <div style={{ fontSize:11, color:G.muted, marginTop:2 }}>{sub}</div>}
        </div>
        <div style={{ fontSize:28 }}>{icon}</div>
      </div>
    </div>
  );
}

function SCMAnalytics({ mrs }) {
  // Team performance
  const teamStats = SC_TEAM.map(member => {
    const assigned = mrs.filter(m => m.assigned_to === member.email);
    const issued   = assigned.filter(m => m.status === "ISSUED").length;
    const pending  = assigned.filter(m => m.status === "APPROVED").length;
    const inProcess = assigned.filter(m => m.status === "IN_PROCESS").length;
    const slaBreaches = assigned.filter(m => getSLADays(m) !== null).length;
    const totalValue  = assigned.reduce((s,m) => s + parseFloat(m.total_cost||0), 0);
    return { ...member, total: assigned.length, issued, pending, inProcess, slaBreaches, totalValue };
  });

  // Pipeline funnel data
  const funnelData = [
    { name: "Approved (SC Pending)", value: mrs.filter(m => m.status==="APPROVED").length,    fill:"#1B6CA8" },
    { name: "In Process",            value: mrs.filter(m => m.status==="IN_PROCESS").length,   fill:"#b8860b" },
    { name: "Issued",                value: mrs.filter(m => m.status==="ISSUED").length,       fill:"#0d6b4e" },
  ];

  // Dept wise breakdown
  const byDept = {};
  mrs.forEach(mr => {
    const d = mr.department || "Unassigned";
    if (!byDept[d]) byDept[d] = { name: d, APPROVED:0, IN_PROCESS:0, ISSUED:0 };
    if (byDept[d][mr.status] !== undefined) byDept[d][mr.status]++;
  });
  const deptData = Object.values(byDept);

  // Status pie
  const statusCounts = {};
  mrs.forEach(m => { statusCounts[m.status] = (statusCounts[m.status]||0)+1; });
  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name: name.replace(/_/g," "), value }));

  const totalSpend = mrs.reduce((s,m) => s+parseFloat(m.total_cost||0), 0);
  const slaCount   = mrs.filter(m => getSLADays(m) !== null).length;

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:28 }}>
        <KPICard label="Total SC MRs"      value={mrs.length}   color="#0d6b4e" icon="📋" />
        <KPICard label="Pending Issuance"  value={mrs.filter(m=>m.status==="APPROVED").length} color="#b8860b" icon="⏳" />
        <KPICard label="SLA Breaches"      value={slaCount}     color={slaCount>0?"#e53935":G.success} icon="⚠" sub={slaCount>0?"Needs attention":"All on track"} />
        <KPICard label="Total Value"       value={`AED ${(totalSpend/1000).toFixed(0)}K`} color={G.primary} icon="💰" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:28 }}>
        {/* Pipeline Funnel */}
        <div style={chart.card}>
          <div style={chart.title}>SC Processing Pipeline</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnelData} layout="vertical" margin={{left:20,right:30}}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false}/>
              <XAxis type="number" tick={{fontSize:11}}/>
              <YAxis type="category" dataKey="name" tick={{fontSize:11}} width={130}/>
              <Tooltip/>
              <Bar dataKey="value" radius={[0,4,4,0]}>
                {funnelData.map((entry, i) => <Cell key={i} fill={entry.fill}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status Pie */}
        <div style={chart.card}>
          <div style={chart.title}>MR Status Distribution</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({name,value})=>`${name}: ${value}`} labelLine={false}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
              </Pie>
              <Tooltip/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Department wise stacked bar */}
      <div style={{ ...chart.card, marginBottom:28 }}>
        <div style={chart.title}>Department Wise MR Stages</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={deptData} margin={{left:0,right:20,top:10}}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="name" tick={{fontSize:11}}/>
            <YAxis tick={{fontSize:11}}/>
            <Tooltip/>
            <Legend wrapperStyle={{fontSize:11}}/>
            <Bar dataKey="APPROVED"   name="Pending Issuance" stackId="a" fill="#1B6CA8"/>
            <Bar dataKey="IN_PROCESS" name="In Process"       stackId="a" fill="#b8860b"/>
            <Bar dataKey="ISSUED"     name="Issued"           stackId="a" fill="#0d6b4e" radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Team Performance */}
      <div style={chart.card}>
        <div style={chart.title}>Team Performance</div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr>{["Team Member","ID","Assigned","Issued","In Process","Pending","SLA Breaches","Total Value"].map(h=>(
              <th key={h} style={{ background:"#0d6b4e", color:"#fff", padding:"8px 12px", textAlign:"left", fontSize:11, fontWeight:600 }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {teamStats.map((m,i) => (
              <tr key={m.email} style={{ background: i%2===0?"#fff":"#f0faf6" }}>
                <td style={chart.td}><strong>{m.name}</strong></td>
                <td style={chart.td}>{m.id}</td>
                <td style={chart.td}>{m.total}</td>
                <td style={{ ...chart.td, color:G.success, fontWeight:600 }}>{m.issued}</td>
                <td style={{ ...chart.td, color:G.warning }}>{m.inProcess}</td>
                <td style={{ ...chart.td, color:"#b8860b" }}>{m.pending}</td>
                <td style={{ ...chart.td, color: m.slaBreaches>0?"#e53935":G.success, fontWeight:600 }}>
                  {m.slaBreaches > 0 ? `⚠ ${m.slaBreaches}` : "✓ 0"}
                </td>
                <td style={{ ...chart.td, fontWeight:600 }}>AED {m.totalValue.toLocaleString("en-AE",{minimumFractionDigits:0})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SCManagerPortal({ session, onLogout }) {
  const [view, setView]         = useState("dashboard");
  const [mrs, setMrs]           = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [formFilter, setFormFilter] = useState("all");
  const [reassignTarget, setReassignTarget] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const loadMRs = async () => {
    try {
      const all = await listMRs("ALL");
      // SC Manager sees only SC-related MRs
      setMrs((all||[]).filter(m => ["APPROVED","IN_PROCESS","ISSUED"].includes(m.status)));
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadMRs(); const t=setInterval(loadMRs,120000); return()=>clearInterval(t); }, []);

  const filteredMRs = filterByFormType(mrs, formFilter);
  const slaBreached = filteredMRs.filter(m => getSLADays(m) !== null);

  const handleReassign = async () => {
    if (!reassignTarget || !selected) return;
    setReassigning(true);
    const r = await call("reassign_mr", { mr_id: selected.mr_id, assigned_to: reassignTarget, reassigned_by: session.name });
    if (r?.success !== false) {
      setActionMsg(`✓ MR reassigned to ${SC_TEAM.find(m=>m.email===reassignTarget)?.name}`);
      loadMRs();
    } else {
      setActionMsg("Error: " + (r?.error||"Unknown"));
    }
    setReassigning(false);
  };

  // Dashboard stats
  const pendingCount   = filteredMRs.filter(m => m.status==="APPROVED").length;
  const inProcessCount = filteredMRs.filter(m => m.status==="IN_PROCESS").length;
  const issuedCount    = filteredMRs.filter(m => m.status==="ISSUED").length;
  const recentActivity = [...filteredMRs].sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at)).slice(0,5);

  return (
    <div style={s.page}>
      <div style={s.shell}>
        {/* Sidebar */}
        <div style={s.sidebar}>
          <div style={s.sideHeader}><GoltensLogo size="sm" dark/></div>
          <div style={s.portalLabel}>SC Manager Portal</div>
          <div style={s.topActions}>
            <button style={s.refreshBtn} onClick={loadMRs}>↻ Refresh</button>
            <button style={s.logoutBtn} onClick={onLogout}>Log Out</button>
          </div>
          <div style={s.userInfo}>
            <div style={s.userName}>{session.name}</div>
            <div style={s.userRole}>Supply Chain Manager</div>
          </div>

          <div style={{padding:"6px 12px 4px"}}>
            <FormTypeFilter mrs={mrs} selected={formFilter} onChange={setFormFilter} accentColor="rgba(255,255,255,0.9)" compact/>
          </div>

          <div style={s.sideSection}>NAVIGATION</div>
          {[
            {key:"dashboard",  label:"🏠 Dashboard"},
            {key:"queue",      label:"📋 MR Queue"},
            {key:"analytics",  label:"📊 Analytics"},
            {key:"sla",        label:`⚠ SLA Alerts ${slaBreached.length>0?`(${slaBreached.length})`:""}` },
            {key:"allstatus",  label:"🔍 All MR Status"},
          ].map(({key,label}) => (
            <div key={key} style={{...s.navItem,...(view===key?s.navItemActive:{})}} onClick={()=>{setView(key);setSelected(null);}}>
              {label}
            </div>
          ))}

          <div style={s.sideSection}>QUICK QUEUE</div>
          {loading && <div style={s.sideLoading}>Loading…</div>}
          {filteredMRs.filter(m=>m.status==="APPROVED").slice(0,5).map(mr => (
            <div key={mr.mr_id} style={{...s.mrCard,...(selected?.mr_id===mr.mr_id?s.mrCardActive:{})}}
              onClick={()=>{setSelected(mr);setView("queue");setActionMsg("");}}>
              <div style={s.mrCardId}>{mr.mr_id} {getSLADays(mr)&&<span style={s.slaDot}>⚠</span>}</div>
              <div style={s.mrCardMeta}>{mr.vessel} · {mr.submitted_by_name}</div>
            </div>
          ))}

          
        </div>

        {/* Main */}
        <div style={s.main}>
          {/* Top bar */}
          <div style={s.topBar}>
            <SearchBar mrs={filteredMRs} onSelect={mr=>{setSelected(mr);setView("queue");}} />
            <NotificationBell mrs={mrs} role="sc_manager" userEmail={session.email} accentColor="#0d6b4e"/>
          </div>

          {/* Dashboard */}
          {view==="dashboard" && (
            <div>
              <div style={s.pageTitle}>SC Manager Dashboard</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24 }}>
                <KPICard label="Pending Issuance" value={pendingCount}   color="#b8860b" icon="⏳"/>
                <KPICard label="In Process"       value={inProcessCount} color={G.primary} icon="🔄"/>
                <KPICard label="Issued"           value={issuedCount}    color={G.success} icon="✅"/>
                <KPICard label="SLA Breaches"     value={slaBreached.length} color={slaBreached.length>0?"#e53935":G.success} icon="⚠"/>
              </div>
              <div style={s.sectionTitle}>Recent Activity</div>
              <table style={s.table}>
                <thead><tr>{["MR Number","Vessel","Job No.","Status","Assigned To","SLA"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>{recentActivity.map((mr,i)=>(
                  <tr key={mr.mr_id} style={{...i%2===0?s.trEven:s.trOdd,cursor:"pointer"}} onClick={()=>{setSelected(mr);setView("queue");}}>
                    <td style={s.td}><strong>{mr.mr_id}</strong></td>
                    <td style={s.td}>{mr.vessel}</td>
                    <td style={s.td}>{mr.job_no}</td>
                    <td style={s.td}><span style={{...s.pill,background:G.pale,color:G.navy}}>{mr.status?.replace(/_/g," ")}</span></td>
                    <td style={s.td}>{SC_TEAM.find(m=>m.email===mr.assigned_to)?.name||mr.assigned_to||"—"}</td>
                    <td style={s.td}>{getSLADays(mr)?<span style={{color:"#e53935",fontWeight:700}}>⚠ {getSLADays(mr).days}d</span>:"✓"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {/* Queue / MR Detail */}
          {view==="queue" && (
            !selected ? (
              <div style={s.emptyState}>
                <div style={{fontSize:48,marginBottom:16}}>📋</div>
                <div style={{fontSize:14,color:"#aaa"}}>Select an MR from the sidebar to review</div>
              </div>
            ) : (
              <div>
                <SLABadge mr={selected}/>
                <MRDetailView mr={selected} showDownload onDownloadPDF={()=>downloadMRWithDocs(selected)}/>

                {/* Reassign panel */}
                <div style={s.panel}>
                  <div style={s.panelTitle}>Reassign MR</div>
                  <div style={{display:"flex",gap:12,alignItems:"flex-end"}}>
                    <div style={{flex:1}}>
                      <label style={s.label}>Assign to SC Team Member</label>
                      <select style={s.select} value={reassignTarget} onChange={e=>setReassignTarget(e.target.value)}>
                        <option value="">Select team member…</option>
                        {SC_TEAM.map(m=><option key={m.email} value={m.email}>{m.name} ({m.id})</option>)}
                      </select>
                    </div>
                    <button style={{...s.reassignBtn,...(reassigning?{opacity:0.7}:{})}}
                      onClick={handleReassign} disabled={reassigning||!reassignTarget}>
                      ↔ Reassign
                    </button>
                  </div>
                  {actionMsg && <div style={{marginTop:10,fontSize:12,color:actionMsg.startsWith("Error")?G.danger:G.success,fontWeight:600}}>{actionMsg}</div>}
                </div>
              </div>
            )
          )}

          {/* Analytics */}
          {view==="analytics" && (
            <div>
              <div style={s.pageTitle}>Supply Chain Analytics</div>
              <SCMAnalytics mrs={filteredMRs}/>
            </div>
          )}

          {/* SLA Alerts */}
          {view==="sla" && (
            <div>
              <div style={s.pageTitle}>SLA Breach Alerts</div>
              {slaBreached.length===0 ? (
                <div style={{textAlign:"center",padding:"60px 20px",color:G.success}}>
                  <div style={{fontSize:48,marginBottom:12}}>✅</div>
                  <div style={{fontSize:16,fontWeight:600}}>All MRs are within SLA thresholds</div>
                </div>
              ) : (
                <table style={s.table}>
                  <thead><tr>{["MR Number","Vessel","Job No.","Status","Days Pending","Over By","Assigned To"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>{slaBreached.map((mr,i)=>{
                    const sla=getSLADays(mr);
                    return (
                      <tr key={mr.mr_id} style={{...i%2===0?s.trEven:s.trOdd,cursor:"pointer"}} onClick={()=>{setSelected(mr);setView("queue");}}>
                        <td style={s.td}><strong>{mr.mr_id}</strong></td>
                        <td style={s.td}>{mr.vessel}</td>
                        <td style={s.td}>{mr.job_no}</td>
                        <td style={s.td}><span style={{background:"#fff5f5",color:G.danger,borderRadius:8,padding:"2px 8px",fontSize:11,fontWeight:700}}>{mr.status?.replace(/_/g," ")}</span></td>
                        <td style={{...s.td,fontWeight:700,color:"#e53935"}}>{sla.days} days</td>
                        <td style={{...s.td,fontWeight:700,color:"#c0392b"}}>+{sla.overBy} days</td>
                        <td style={s.td}>{SC_TEAM.find(m=>m.email===mr.assigned_to)?.name||mr.assigned_to||"—"}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
            </div>
          )}

          {/* All Status */}
          {view==="allstatus" && (
            <div>
              <div style={s.pageTitle}>All MR Status</div>
              <table style={s.table}>
                <thead><tr>{["MR Number","Vessel","Dept","Job No.","Assigned To","Total (AED)","Status","SLA"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>{filteredMRs.map((mr,i)=>(
                  <tr key={mr.mr_id} style={{...i%2===0?s.trEven:s.trOdd,cursor:"pointer"}} onClick={()=>{setSelected(mr);setView("queue");}}>
                    <td style={s.td}><strong>{mr.mr_id}</strong></td>
                    <td style={s.td}>{mr.vessel}</td>
                    <td style={s.td}>{mr.department||"—"}</td>
                    <td style={s.td}>{mr.job_no}</td>
                    <td style={s.td}>{SC_TEAM.find(m=>m.email===mr.assigned_to)?.name||mr.assigned_to||"—"}</td>
                    <td style={s.td}>{parseFloat(mr.total_cost||0).toLocaleString("en-AE",{minimumFractionDigits:2})}</td>
                    <td style={s.td}><span style={{background:G.pale,color:G.navy,borderRadius:8,padding:"2px 8px",fontSize:11,fontWeight:600}}>{mr.status?.replace(/_/g," ")}</span></td>
                    <td style={s.td}>{getSLADays(mr)?<span style={{color:"#e53935",fontWeight:700}}>⚠ {getSLADays(mr).days}d</span>:"✓"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <HelpChatbot role="sc_manager" userName={session?.name} userEmail={session?.email}/>
    </div>
  );
}

const chart = {
  card:  { background:"#fff", border:`1px solid ${G.paleBorder}`, borderRadius:10, padding:"16px 20px", marginBottom:0 },
  title: { fontWeight:700, fontSize:13, color:"#0d6b4e", marginBottom:14, textTransform:"uppercase", letterSpacing:0.3 },
  td:    { padding:"8px 12px", borderBottom:`1px solid ${G.paleBorder}` },
};

const s = {
  page:        { minHeight:"100vh", background:"#f0f2f5", fontFamily:"'Inter','Segoe UI',system-ui,Arial,sans-serif", fontSize:13 },
  shell:       { display:"flex", minHeight:"100vh" },
  sidebar:     { width:270, background:"#0d6b4e", color:"#fff", display:"flex", flexDirection:"column", padding:"0 0 16px", flexShrink:0 },
  sideHeader:  { padding:"20px 20px 8px", borderBottom:"1px solid rgba(255,255,255,0.15)" },
  portalLabel: { fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.7)", letterSpacing:1, textTransform:"uppercase", padding:"8px 20px 4px" },
  userInfo:    { padding:"6px 20px 12px", borderBottom:"1px solid rgba(255,255,255,0.1)" },
  userName:    { fontWeight:700, fontSize:13, color:"#fff" },
  userRole:    { fontSize:10, color:"rgba(255,255,255,0.6)", marginTop:2 },
  sideSection: { fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.45)", letterSpacing:1.5, padding:"10px 20px 6px" },
  navItem:     { margin:"1px 12px", padding:"9px 12px", borderRadius:6, cursor:"pointer", fontSize:12, color:"rgba(255,255,255,0.8)" },
  navItemActive:{ background:"rgba(255,255,255,0.2)", color:"#fff", fontWeight:600 },
  sideLoading: { fontSize:11, color:"rgba(255,255,255,0.4)", padding:"8px 20px" },
  mrCard:      { margin:"2px 12px", padding:"8px 12px", borderRadius:6, cursor:"pointer" },
  mrCardActive:{ background:"rgba(255,255,255,0.15)" },
  mrCardId:    { fontWeight:700, fontSize:12, color:"#fff" },
  mrCardMeta:  { fontSize:10, color:"rgba(255,255,255,0.65)", marginTop:2 },
  slaDot:      { color:"#ffcdd2", fontSize:10 },
  sideFooter:  { marginTop:"auto", padding:"16px 20px 0", borderTop:"1px solid rgba(255,255,255,0.1)", display:"flex", flexDirection:"column", gap:8 },
  refreshBtn:  { background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", borderRadius:4, padding:"6px 14px", fontSize:12, cursor:"pointer" },
  logoutBtn:   { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.15)", color:"#fff", borderRadius:4, padding:"6px 14px", fontSize:12, cursor:"pointer" },
  main:        { flex:1, padding:"20px 28px", overflowY:"auto" },
  topBar:      { display:"flex", alignItems:"center", gap:10, marginBottom:20, background:"#0d6b4e", borderRadius:8, padding:"8px 14px" },
  pageTitle:   { fontWeight:700, fontSize:18, color:"#0d6b4e", marginBottom:20, paddingBottom:12, borderBottom:`2px solid #0d6b4e` },
  sectionTitle:{ fontWeight:700, fontSize:13, color:"#333", marginBottom:12, textTransform:"uppercase" },
  emptyState:  { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"60vh" },
  table:       { width:"100%", borderCollapse:"collapse", fontSize:12 },
  th:          { background:"#0d6b4e", color:"#fff", padding:"8px 10px", textAlign:"left", fontWeight:600, fontSize:11 },
  trEven:      { background:"#fff" },
  trOdd:       { background:"#f0faf6" },
  td:          { padding:"7px 10px", borderBottom:`1px solid ${G.paleBorder}` },
  pill:        { borderRadius:10, padding:"2px 10px", fontSize:11, fontWeight:600 },
  panel:       { background:"#fafbfc", border:`1px solid ${G.paleBorder}`, borderRadius:8, padding:"18px 22px", marginTop:16 },
  panelTitle:  { fontWeight:700, fontSize:13, color:"#0d6b4e", marginBottom:14, textTransform:"uppercase" },
  label:       { display:"block", fontSize:12, fontWeight:600, color:"#333", marginBottom:4 },
  select:      { width:"100%", border:`1px solid ${G.paleBorder}`, borderRadius:5, padding:"8px 10px", fontSize:13, outline:"none" },
  reassignBtn: { background:"#0d6b4e", color:"#fff", border:"none", borderRadius:5, padding:"9px 20px", fontSize:13, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" },
};