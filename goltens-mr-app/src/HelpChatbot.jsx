/**
 * HelpChatbot.jsx
 * Floating AI chatbot with live MR data awareness.
 * Uses backend /invoke to call Claude API (avoids CORS issues).
 * Bouncing animation until opened.
 */
import { useState, useRef, useEffect } from "react";
import { listMRs } from "./api";
import { G } from "./theme";


// Simple markdown → JSX renderer
function renderMarkdown(text) {
  const lines = text.split("\n");
  const elements = [];
  let tableRows = [];
  let inTable = false;
  let key = 0;

  const flushTable = () => {
    if (tableRows.length > 1) {
      const headers = tableRows[0].split("|").map(h => h.trim()).filter(Boolean);
      const rows    = tableRows.slice(2).map(r => r.split("|").map(c => c.trim()).filter(Boolean));
      elements.push(
        <div key={key++} style={md.tableWrap}>
          <table style={md.table}>
            <thead>
              <tr>{headers.map((h,i) => <th key={i} style={md.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row,i) => (
                <tr key={i} style={i%2===0?md.trEven:md.trOdd}>
                  {row.map((cell,j) => <td key={j} style={md.td}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    tableRows = [];
    inTable = false;
  };

  const parseLine = (line, k) => {
    // Bold **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**")
        ? <strong key={i}>{p.slice(2,-2)}</strong>
        : p
    );
  };

  lines.forEach((line, i) => {
    // Table detection
    if (line.includes("|") && line.trim().startsWith("|")) {
      inTable = true;
      tableRows.push(line);
      return;
    }
    if (inTable) { flushTable(); }

    if (!line.trim()) {
      elements.push(<div key={key++} style={{height:6}}/>);
    } else if (line.startsWith("### ")) {
      elements.push(<div key={key++} style={md.h3}>{parseLine(line.slice(4))}</div>);
    } else if (line.startsWith("## ")) {
      elements.push(<div key={key++} style={md.h2}>{parseLine(line.slice(3))}</div>);
    } else if (line.startsWith("# ")) {
      elements.push(<div key={key++} style={md.h1}>{parseLine(line.slice(2))}</div>);
    } else if (line.match(/^\d+\.\s/)) {
      elements.push(<div key={key++} style={md.li}>{"• "}{parseLine(line.replace(/^\d+\.\s/, ""))}</div>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(<div key={key++} style={md.li}>{"• "}{parseLine(line.slice(2))}</div>);
    } else {
      elements.push(<div key={key++} style={md.p}>{parseLine(line)}</div>);
    }
  });

  if (inTable) flushTable();
  return elements;
}

const md = {
  h1:       { fontWeight:700, fontSize:14, color:"#1A3A5C", marginBottom:6, marginTop:8, borderBottom:"1px solid #e8e8e8", paddingBottom:4 },
  h2:       { fontWeight:700, fontSize:13, color:"#1A3A5C", marginBottom:5, marginTop:6 },
  h3:       { fontWeight:700, fontSize:12, color:"#1B6CA8", marginBottom:4, marginTop:6 },
  p:        { fontSize:13, lineHeight:1.55, marginBottom:2 },
  li:       { fontSize:13, lineHeight:1.55, marginBottom:2, paddingLeft:4 },
  tableWrap:{ overflowX:"auto", marginTop:8, marginBottom:8 },
  table:    { borderCollapse:"collapse", width:"100%", fontSize:11 },
  th:       { background:"#1A3A5C", color:"#fff", padding:"5px 10px", textAlign:"left", fontWeight:600, whiteSpace:"nowrap" },
  trEven:   { background:"#fff" },
  trOdd:    { background:"#f0f4f8" },
  td:       { padding:"4px 10px", borderBottom:"1px solid #e8e8e8", fontSize:11 },
};

async function askClaude(systemPrompt, messages) {
  // Route through our own backend to avoid CORS — backend calls Anthropic API
  const res = await fetch("/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "chatbot_query",
      data: {
        system:   systemPrompt,
        messages: messages,
      },
    }),
  });
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(data.error);
  return data?.reply || "Sorry, I could not get a response.";
}

export default function HelpChatbot({ role, userName, userEmail }) {
  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [mrData, setMrData]           = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const bottomRef                     = useRef(null);
  const sidebarColor                  = getSidebarColor(role);

  useEffect(() => { loadMRData(); }, []);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: "assistant", content: getGreeting(role, userName) }]);
    }
  }, [open]);

  const loadMRData = async () => {
    setDataLoading(true);
    try {
      const all = await listMRs("ALL");
      setMrData(Array.isArray(all) ? all : []);
    } catch { setMrData([]); }
    setDataLoading(false);
  };

  const getFilteredMRs = () => {
    if (!mrData) return [];
    switch (role) {
      case "user":         return mrData.filter(m => m.submitted_by_email === userEmail);
      case "manager":      return mrData;
      case "hod":          return mrData;
      case "supply_chain": return mrData.filter(m => m.assigned_to === userEmail || ["APPROVED","IN_PROCESS","ISSUED"].includes(m.status));
      case "warehouse":    return mrData.filter(m => ["APPROVED","IN_PROCESS","ISSUED"].includes(m.status));
      default:             return mrData;
    }
  };

  const buildDataContext = () => {
    const mrs = getFilteredMRs();
    if (!mrs || mrs.length === 0) return "No MR data available yet.";
    const now   = new Date();
    const today = now.toISOString().split("T")[0];
    const byStatus = {}, byJob = {}, byUser = {}, byFormType = {}, byDate = {};
    let totalSpend = 0, budgetedYes = 0, budgetedNo = 0;
    mrs.forEach(mr => {
      byStatus[mr.status] = (byStatus[mr.status]||0)+1;
      const job = mr.job_no||"Unknown";
      if (!byJob[job]) byJob[job]={count:0,total:0};
      byJob[job].count++; byJob[job].total+=parseFloat(mr.total_cost||0);
      const u = mr.submitted_by_name||mr.submitted_by_email||"Unknown";
      if (!byUser[u]) byUser[u]={count:0,total:0};
      byUser[u].count++; byUser[u].total+=parseFloat(mr.total_cost||0);
      const ft = mr.form_type||"Material Requisition";
      byFormType[ft]=(byFormType[ft]||0)+1;
      const d = mr.date_requested||mr.created_at?.split("T")[0]||"Unknown";
      byDate[d]=(byDate[d]||0)+1;
      totalSpend+=parseFloat(mr.total_cost||0);
      (mr.items||[]).forEach(it=>{ if(it.budgeted==="Yes") budgetedYes++; else if(it.budgeted==="No") budgetedNo++; });
    });
    const last2 = mrs.filter(m=>{ const d=m.date_requested||m.created_at?.split("T")[0]; if(!d)return false; return (now-new Date(d))/(86400000)<=2; });
    const last7 = mrs.filter(m=>{ const d=m.date_requested||m.created_at?.split("T")[0]; if(!d)return false; return (now-new Date(d))/(86400000)<=7; });
    // Delay analysis for pending MRs
    const pendingMRs = mrs.filter(m => ["PENDING","PENDING_HOD","IN_PROCESS"].includes(m.status));
    const delayAnalysis = pendingMRs.map(mr => {
      const submitted = new Date(mr.date_requested || mr.created_at);
      const daysPending = Math.floor((now - submitted) / 86400000);
      let stage = "", issue = "";
      if (mr.status === "PENDING") {
        stage = "Waiting for Manager approval";
        issue = daysPending > 2 ? `DELAYED ${daysPending} days — Manager has not approved yet` : `${daysPending} day(s) since submission`;
      } else if (mr.status === "PENDING_HOD") {
        stage = "Waiting for HOD second-level approval";
        issue = daysPending > 3 ? `DELAYED ${daysPending} days — HOD has not approved yet` : `${daysPending} day(s) awaiting HOD`;
      } else if (mr.status === "IN_PROCESS") {
        stage = "Stock unavailable — Supply Chain processing";
        issue = mr.inprocess_note || "Stock unavailable";
      }
      return `[${mr.mr_id}] Job:${mr.job_no} | By:${mr.submitted_by_name} | Stage:${stage} | Issue:${issue} | AED ${mr.total_cost}`;
    });

    return `=== LIVE MR DATA (${today}) ===
Total MRs: ${mrs.length} | Total Spend: AED ${totalSpend.toLocaleString("en-AE",{minimumFractionDigits:2})}
Last 2 days: ${last2.length} | Last 7 days: ${last7.length}
Budgeted items Yes: ${budgetedYes} | No: ${budgetedNo}

STATUS BREAKDOWN:
${Object.entries(byStatus).map(([s,c])=>`- ${s.replace(/_/g," ")}: ${c}`).join("\n")}

PENDING / DELAYED MRs (${pendingMRs.length}):
${delayAnalysis.length > 0 ? delayAnalysis.join("\n") : "None pending."}

BY FORM TYPE: ${Object.entries(byFormType).map(([f,c])=>`${f}:${c}`).join(", ")}
BY JOB: ${Object.entries(byJob).map(([j,v])=>`Job ${j}: ${v.count} MRs AED ${v.total.toFixed(2)}`).join(" | ")}
BY USER: ${Object.entries(byUser).map(([u,v])=>`${u}: ${v.count} MRs AED ${v.total.toFixed(2)}`).join(" | ")}
RECENT: ${Object.entries(byDate).sort().reverse().slice(0,5).map(([d,c])=>`${d}:${c}`).join(", ")}

ALL MRs:
${mrs.map(mr=>`[${mr.mr_id}] ${mr.form_type||"MR"} | Status:${mr.status} | Job:${mr.job_no} | Vessel:${mr.vessel||"-"} | By:${mr.submitted_by_name} | Date:${mr.date_requested} | AED ${mr.total_cost} | ApprovedBy:${mr.approved_by||mr.hod_approved_by||"-"} | RejectedBy:${mr.rejected_by||"-"} | Reason:${mr.rejection_reason||"-"} | Note:${mr.inprocess_note||"-"}`).join("\n")}`;
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const reply = await askClaude(
        getSystemPrompt(role, userName, userEmail, buildDataContext()),
        newMessages.map(m => ({ role: m.role, content: m.content }))
      );
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}. Please try again.` }]);
    }
    setLoading(false);
  };

  const filteredCount = getFilteredMRs().length;

  return (
    <>
      <style>{`
        @keyframes chatBounce {
          0%,100%{transform:translateY(0);}
          30%{transform:translateY(-10px);}
          60%{transform:translateY(-5px);}
        }
        @keyframes chatSlideIn {
          from{opacity:0;transform:scale(0.92) translateY(12px);}
          to{opacity:1;transform:scale(1) translateY(0);}
        }
      `}</style>

      {/* Floating button */}
      <button style={{...btn.fab, background:sidebarColor, animation:open?"none":"chatBounce 1.8s ease infinite"}}
        onClick={()=>setOpen(o=>!o)} title="Help & Support">
        {open ? "✕" : "💬"}
        {!open && filteredCount > 0 && <span style={btn.badge}>{filteredCount}</span>}
      </button>

      {/* Chat window */}
      {open && (
        <div style={btn.window}>
          <div style={{...btn.header, background:sidebarColor}}>
            <div style={btn.headerLeft}>
              <div style={btn.headerIcon}>🤖</div>
              <div>
                <div style={btn.headerTitle}>Goltens Assistant</div>
                <div style={btn.headerSub}>{getRoleLabel(role)} · {dataLoading?"Loading…":`${filteredCount} MRs`}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button style={btn.refreshBtn} onClick={loadMRData} title="Refresh">↻</button>
              <button style={btn.headerClose} onClick={()=>setOpen(false)}>✕</button>
            </div>
          </div>

          <div style={btn.messages}>
            {messages.map((m,i)=>(
              <div key={i} style={{...btn.msgRow, justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                {m.role==="assistant" && <div style={btn.avatar}>🤖</div>}
                <div style={{...btn.bubble, ...(m.role==="user"?{...btn.bubbleUser,background:sidebarColor}:btn.bubbleBot)}}>
                  {m.role === "assistant" ? renderMarkdown(m.content) : m.content.split("\n").map((line,j)=><span key={j}>{line}{j<m.content.split("\n").length-1&&<br/>}</span>)}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{...btn.msgRow,justifyContent:"flex-start"}}>
                <div style={btn.avatar}>🤖</div>
                <div style={btn.bubbleBot}><span style={btn.typing}>● ● ●</span></div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          <div style={btn.quickRow}>
            {getQuickQuestions(role).map((q,i)=>(
              <button key={i} style={{...btn.quickBtn,borderColor:sidebarColor,color:sidebarColor}}
                onClick={()=>setInput(q)}>{q}</button>
            ))}
          </div>

          <div style={btn.inputRow}>
            <input style={btn.input} placeholder="Ask anything about your portal…"
              value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendMessage()} disabled={loading}/>
            <button style={{...btn.sendBtn,background:sidebarColor,opacity:loading||!input.trim()?0.5:1}}
              onClick={sendMessage} disabled={loading||!input.trim()}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}

function getRoleLabel(role) {
  return {user:"User",manager:"Manager",hod:"GM / HOD",supply_chain:"Supply Chain",warehouse:"Warehouse"}[role]||"Portal";
}
function getSidebarColor(role) {
  return {user:G.primary,manager:G.navy,hod:"#4a148c",supply_chain:"#0d6b4e",warehouse:"#5d4037"}[role]||G.primary;
}
function getGreeting(role, name) {
  const n = name?`, ${name}`:"";
  return {
    user:`Hi${n}! 👋 I can answer questions about your MR submissions and status. Try "How many MRs did I submit this week?" or "What is my latest MR status?"`,
    manager:`Hello${n}! 👋 I have live access to all MR data. Ask "How many MRs are pending?", "Total spend by job number", or "MRs above AED 5,000."`,
    hod:`Hello${n}! 👋 I have full MR visibility. Ask "Total spend this month", "How many needed HOD approval?", or "Show all rejected MRs."`,
    supply_chain:`Hi${n}! 👋 I can help with your assigned MRs. Ask "How many are approved and waiting?", "What items are in process?", or "Show MRs assigned to me."`,
    warehouse:`Hi${n}! 👋 I can help with item issuance. Ask "How many MRs are pending issuance?", "What needs to be issued today?", or "Show all issued MRs."`,
  }[role]||`Hi${n}! How can I help?`;
}
function getQuickQuestions(role) {
  return {
    user:         ["My MR status?","Last 7 days submissions","Any rejected MRs?"],
    manager:      ["Total spend today","Pending approvals","MRs above AED 5000"],
    hod:          ["HOD pending count","Total utilised","Out of budget items"],
    supply_chain: ["Approved pending","In process MRs","Issued this week"],
    warehouse:    ["Pending issuance","Issued today","All approved MRs"],
  }[role]||[];
}
function getSystemPrompt(role, userName, userEmail, dataContext) {
  const base = `You are a smart assistant for Goltens Co. Ltd. Dubai Branch MR portal.
User: ${userName||"Portal User"} (${userEmail||""}) | Role: ${getRoleLabel(role)} | Today: ${new Date().toISOString().split("T")[0]}
Answer questions using the LIVE MR DATA below. Be concise and professional.
Format AED amounts as AED X,XXX.XX. Show exact numbers from the data.
Never make up data.

FORMATTING RULES (strictly follow these):
- Use ### for section headings
- Use **text** for bold emphasis on key values (MR numbers, amounts, names)
- When listing multiple MRs or showing comparisons, ALWAYS use a markdown table:
  | Column1 | Column2 | Column3 |
  |---------|---------|---------|
  | value   | value   | value   |
- Use bullet points (- item) for short lists under 4 items
- Keep responses concise — no unnecessary filler words
- For single-answer questions answer in 1-2 lines max

${dataContext}`;
  const extras = {
    user:`\nYou only know about this user's MRs (already filtered above). Help with: status checks, date range queries, understanding approval stages, form filling guidance.`,
    manager:`\nHelp with: all MRs overview, pending approvals, spend by user/job/date, budget analysis, approval flow.
Key capability: The PENDING/DELAYED MRs section shows exactly which MRs are stuck, at which stage, how many days delayed, and why.
When asked about delays or pending MRs always refer to that section and give specific MR numbers, submitter names, days delayed, and the specific issue.`,
    hod:`\nHelp with: full system overview, PENDING_HOD MRs, total spend, budget utilisation, escalation analysis.
Key capability: The PENDING/DELAYED MRs section shows which MRs are waiting for HOD approval specifically (PENDING_HOD status), how many days they have been waiting, and which MRs need immediate attention.
When asked about delays always give specific MR IDs, submitters, days pending, and stage.`,
    supply_chain:`\nHelp with: assigned MRs, approved pending queue, in-process tracking, stock unavailability, date range queries.`,
    warehouse:`\nHelp with: pending issuance, issued MRs, daily counts, items to issue, completion tracking.`,
  };
  return base + (extras[role]||"");
}

const btn = {
  fab:{position:"fixed",bottom:28,right:28,width:54,height:54,borderRadius:"50%",border:"none",color:"#fff",fontSize:22,cursor:"pointer",zIndex:9000,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center"},
  badge:{position:"absolute",top:-4,right:-4,background:"#e53935",color:"#fff",borderRadius:"50%",width:20,height:20,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"},
  window:{position:"fixed",bottom:96,right:28,width:380,height:560,background:"#fff",borderRadius:16,boxShadow:"0 12px 48px rgba(0,0,0,0.22)",zIndex:9000,display:"flex",flexDirection:"column",overflow:"hidden",border:"1px solid #e0e0e0",animation:"chatSlideIn 0.22s ease"},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",flexShrink:0},
  headerLeft:{display:"flex",alignItems:"center",gap:10},
  headerIcon:{fontSize:26},
  headerTitle:{fontWeight:700,color:"#fff",fontSize:14},
  headerSub:{fontSize:10,color:"rgba(255,255,255,0.75)",marginTop:1},
  refreshBtn:{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:4,padding:"3px 8px",fontSize:11,cursor:"pointer"},
  headerClose:{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:"50%",width:26,height:26,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"},
  messages:{flex:1,overflowY:"auto",padding:"14px 12px",display:"flex",flexDirection:"column",gap:10,background:"#f8f9fb"},
  msgRow:{display:"flex",alignItems:"flex-end",gap:6},
  avatar:{fontSize:18,flexShrink:0,marginBottom:2},
  bubble:{maxWidth:"78%",padding:"9px 13px",borderRadius:12,fontSize:13,lineHeight:1.55,wordBreak:"break-word"},
  bubbleBot:{background:"#fff",border:"1px solid #e8e8e8",borderRadius:"12px 12px 12px 2px",color:"#333"},
  bubbleUser:{color:"#fff",borderRadius:"12px 12px 2px 12px"},
  typing:{color:"#aaa",letterSpacing:3,fontSize:16},
  quickRow:{display:"flex",gap:6,padding:"6px 10px",overflowX:"auto",flexShrink:0,borderTop:"1px solid #f0f0f0"},
  quickBtn:{whiteSpace:"nowrap",background:"#fff",border:"1px solid",borderRadius:12,padding:"4px 10px",fontSize:11,cursor:"pointer",fontWeight:600,flexShrink:0},
  inputRow:{display:"flex",gap:8,padding:"10px 12px",borderTop:"1px solid #eee",background:"#fff",flexShrink:0},
  input:{flex:1,border:"1px solid #ddd",borderRadius:20,padding:"8px 14px",fontSize:13,outline:"none",fontFamily:"inherit"},
  sendBtn:{width:38,height:38,borderRadius:"50%",border:"none",color:"#fff",cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"opacity 0.15s"},
};
