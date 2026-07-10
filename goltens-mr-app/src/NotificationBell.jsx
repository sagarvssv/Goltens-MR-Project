/**
 * NotificationBell.jsx
 * - Persistent notifications — no auto-clear
 * - History tab for previously read notifications
 * - Click navigates to the MR
 * - Stores read state in localStorage
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { G } from "./theme";

const STORAGE_KEY = "goltens_notifications_seen";

function getSeenIds() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}
function markSeen(mrId) {
  const seen = getSeenIds();
  seen[mrId] = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
}

function buildNotifications(mrs, role, userEmail) {
  const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const seen   = getSeenIds();
  const unread = [], history = [];

  mrs.forEach(mr => {
    const updated = new Date(mr.updated_at || mr.created_at).getTime();
    if (updated < cutoff) return;

    let msg = "", icon = "📋", type = "info";

    if (role === "user" && mr.submitted_by_email === userEmail) {
      if      (mr.status === "APPROVED")    { msg = `MR ${mr.mr_id} approved ✓`; icon = "✅"; type = "success"; }
      else if (mr.status === "REJECTED")    { msg = `MR ${mr.mr_id} rejected — ${mr.rejection_reason || ""}`.trim(); icon = "❌"; type = "danger"; }
      else if (mr.status === "PENDING_HOD") { msg = `MR ${mr.mr_id} forwarded to HOD`; icon = "🔺"; type = "warning"; }
      else if (mr.status === "ISSUED")      { msg = `Items issued for MR ${mr.mr_id}`; icon = "📦"; type = "success"; }
      else if (mr.status === "IN_PROCESS")  { msg = `MR ${mr.mr_id} in process — stock pending`; icon = "⏳"; type = "warning"; }
      else if (mr.status === "PENDING")     { msg = `MR ${mr.mr_id} submitted — awaiting approval`; icon = "📋"; type = "info"; }
    } else if (role === "manager") {
      if      (mr.status === "PENDING")     { msg = `New MR ${mr.mr_id} awaiting your approval`; icon = "📋"; type = "info"; }
      else if (mr.status === "ISSUED")      { msg = `MR ${mr.mr_id} issued — Job ${mr.job_no}`; icon = "✅"; type = "success"; }
    } else if (role === "hod") {
      if      (mr.status === "PENDING_HOD") { msg = `MR ${mr.mr_id} needs your HOD approval`; icon = "🔺"; type = "warning"; }
      else if (mr.status === "ISSUED")      { msg = `MR ${mr.mr_id} issued — Job ${mr.job_no}`; icon = "✅"; type = "success"; }
    } else if (role === "supply_chain" || role === "sc_manager") {
      if      (mr.status === "APPROVED")    { msg = `MR ${mr.mr_id} approved — ready to process`; icon = "📋"; type = "info"; }
      else if (mr.status === "ISSUED")      { msg = `MR ${mr.mr_id} items issued`; icon = "✅"; type = "success"; }
    } else if (role === "warehouse") {
      if      (mr.status === "APPROVED" || mr.status === "IN_PROCESS") { msg = `MR ${mr.mr_id} ready for issuance`; icon = "📦"; type = "info"; }
    }

    if (!msg) return;

    const notif = { mr_id: mr.mr_id, message: msg, icon, type,
      timestamp: updated, vessel: mr.vessel, job_no: mr.job_no, status: mr.status, mr };

    if (seen[mr.mr_id]) history.push({ ...notif, read: true });
    else                unread.push(notif);
  });

  unread.sort((a,b) => b.timestamp - a.timestamp);
  history.sort((a,b) => b.timestamp - a.timestamp);
  return { unread: unread.slice(0,20), history: history.slice(0,30) };
}

const typeColors = {
  success: { bg:"#e8f5e9", border:"#a5d6a7", color:G.success },
  danger:  { bg:"#fff5f5", border:"#f5c6c6", color:G.danger  },
  warning: { bg:"#fff8e1", border:"#ffe082", color:"#b8860b" },
  info:    { bg:G.pale,    border:G.paleBorder, color:G.primary },
};

export default function NotificationBell({ mrs, role, userEmail, accentColor, onNavigate }) {
  const [open, setOpen]       = useState(false);
  const [tab, setTab]         = useState("unread");
  const [unread, setUnread]   = useState([]);
  const [history, setHistory] = useState([]);
  const ref                   = useRef(null);
  const color = accentColor || G.primary;

  // Rebuild notifications when mrs changes — but DON'T close the panel
  useEffect(() => {
    const { unread: u, history: h } = buildNotifications(mrs, role, userEmail);
    setUnread(u);
    setHistory(h);
  }, [mrs, role, userEmail]);

  // Close on outside click — use capture phase to avoid re-render conflicts
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handler, true);
    }
    return () => document.removeEventListener("mousedown", handler, true);
  }, [open]);

  const handleNotifClick = useCallback((n) => {
    markSeen(n.mr_id);
    setUnread(prev => prev.filter(x => x.mr_id !== n.mr_id));
    setHistory(prev => [{ ...n, read: true }, ...prev.filter(x => x.mr_id !== n.mr_id)]);
    if (onNavigate) onNavigate(n.mr);
    setOpen(false);
  }, [onNavigate]);

  const markAllRead = useCallback(() => {
    unread.forEach(n => markSeen(n.mr_id));
    setHistory(prev => [...unread.map(n => ({...n,read:true})), ...prev.filter(x => !unread.find(u => u.mr_id===x.mr_id))]);
    setUnread([]);
  }, [unread]);

  const timeAgo = (ts) => {
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 1)    return "just now";
    if (diff < 60)   return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
    return `${Math.floor(diff/1440)}d ago`;
  };

  return (
    <div ref={ref} style={{ position:"relative", flexShrink:0 }}>
      <button style={s.bell} onClick={() => setOpen(o => !o)} title="Notifications">
        🔔
        {unread.length > 0 && (
          <span style={s.badge}>{unread.length > 9 ? "9+" : unread.length}</span>
        )}
      </button>

      {open && (
        <div style={s.panel} onMouseDown={e => e.stopPropagation()}>
          {/* Header */}
          <div style={{ ...s.panelHeader, background: color }}>
            <span style={s.panelTitle}>🔔 Notifications</span>
            {unread.length > 0 && (
              <button style={s.markAll} onClick={markAllRead}>Mark all read</button>
            )}
          </div>

          {/* Tabs */}
          <div style={s.tabs}>
            <button style={{ ...s.tab, ...(tab==="unread" ? { ...s.tabActive, borderBottomColor: color, color } : {}) }}
              onClick={() => setTab("unread")}>
              Unread {unread.length > 0 && <span style={{ ...s.tabBadge, background: color }}>{unread.length}</span>}
            </button>
            <button style={{ ...s.tab, ...(tab==="history" ? { ...s.tabActive, borderBottomColor: color, color } : {}) }}
              onClick={() => setTab("history")}>
              History {history.length > 0 && <span style={{ ...s.tabBadge, background:"#aaa" }}>{history.length}</span>}
            </button>
          </div>

          {/* Content */}
          <div style={s.list}>
            {tab === "unread" && (
              unread.length === 0
                ? <div style={s.empty}>✅ All caught up — no new notifications</div>
                : unread.map(n => {
                    const tc = typeColors[n.type] || typeColors.info;
                    return (
                      <div key={n.mr_id} style={{ ...s.notif, background: tc.bg, borderLeft: `4px solid ${tc.color}`, cursor:"pointer" }}
                        onClick={() => handleNotifClick(n)}>
                        <div style={s.notifRow}>
                          <span style={{ fontSize:16 }}>{n.icon}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, fontWeight:600, color:G.navy, lineHeight:1.4 }}>{n.message}</div>
                            {n.vessel && <div style={{ fontSize:11, color:G.muted, marginTop:2 }}>{n.vessel} · Job {n.job_no}</div>}
                          </div>
                          <div style={{ fontSize:10, color:G.muted, whiteSpace:"nowrap", marginLeft:8 }}>{timeAgo(n.timestamp)}</div>
                        </div>
                        <div style={{ fontSize:10, color: tc.color, fontWeight:600, marginTop:4, marginLeft:26 }}>
                          Click to view →
                        </div>
                      </div>
                    );
                  })
            )}
            {tab === "history" && (
              history.length === 0
                ? <div style={s.empty}>No notification history yet</div>
                : history.map((n,i) => {
                    return (
                      <div key={`${n.mr_id}-${i}`} style={{ ...s.notif, background:"#f9f9f9", borderLeft:"4px solid #ddd", cursor: onNavigate ? "pointer" : "default", opacity:0.75 }}
                        onClick={() => { if(onNavigate) onNavigate(n.mr); setOpen(false); }}>
                        <div style={s.notifRow}>
                          <span style={{ fontSize:14, opacity:0.6 }}>{n.icon}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:11, color:G.muted, lineHeight:1.4 }}>{n.message}</div>
                            {n.vessel && <div style={{ fontSize:10, color:"#bbb", marginTop:1 }}>{n.vessel}</div>}
                          </div>
                          <div style={{ fontSize:10, color:"#ccc", whiteSpace:"nowrap", marginLeft:8 }}>{timeAgo(n.timestamp)}</div>
                        </div>
                      </div>
                    );
                  })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  bell:      { background:"none", border:"none", cursor:"pointer", fontSize:18, position:"relative", padding:"4px 6px", borderRadius:6, display:"flex", alignItems:"center", gap:0 },
  badge:     { position:"absolute", top:0, right:0, background:"#e53e3e", color:"#fff", borderRadius:"50%", fontSize:9, fontWeight:700, minWidth:16, height:16, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px" },
  panel:     { position:"absolute", right:0, top:"calc(100% + 6px)", width:340, background:"#fff", borderRadius:10, boxShadow:"0 8px 32px rgba(0,0,0,0.18)", border:`1px solid ${G.paleBorder}`, zIndex:9999, overflow:"hidden" },
  panelHeader:{ padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" },
  panelTitle:{ color:"#fff", fontWeight:700, fontSize:13 },
  markAll:   { background:"rgba(255,255,255,0.25)", border:"1px solid rgba(255,255,255,0.5)", color:"#fff", borderRadius:4, padding:"3px 8px", fontSize:11, cursor:"pointer", fontWeight:600 },
  tabs:      { display:"flex", borderBottom:`1px solid ${G.paleBorder}`, background:"#fff" },
  tab:       { flex:1, padding:"8px", fontSize:12, fontWeight:600, color:G.muted, background:"none", border:"none", borderBottom:"2px solid transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 },
  tabActive: { borderBottom:"2px solid", fontWeight:700 },
  tabBadge:  { color:"#fff", borderRadius:10, padding:"1px 6px", fontSize:10, fontWeight:700 },
  list:      { maxHeight:340, overflowY:"auto", padding:"8px" },
  notif:     { borderRadius:7, padding:"10px 12px", marginBottom:6, transition:"opacity 0.2s" },
  notifRow:  { display:"flex", alignItems:"flex-start", gap:8 },
  empty:     { padding:"24px 16px", textAlign:"center", color:G.muted, fontSize:12 },
};