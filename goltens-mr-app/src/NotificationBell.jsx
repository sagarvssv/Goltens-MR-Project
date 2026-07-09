/**
 * NotificationBell.jsx — Clickable notifications that navigate to the MR
 */
import { useState, useEffect } from "react";
import { G } from "./theme";

function getNotifications(mrs, role, userEmail) {
  const now    = Date.now();
  const cutoff = now - (48 * 60 * 60 * 1000); // last 48 hours
  const lastSeen = JSON.parse(localStorage.getItem("goltens_last_seen") || "{}");
  const notifications = [];

  mrs.forEach(mr => {
    const updated = new Date(mr.updated_at || mr.created_at).getTime();
    if (updated < cutoff) return;
    const seenAt = lastSeen[mr.mr_id] || 0;
    if (updated <= seenAt) return;

    let msg = "", icon = "📋", type = "info";

    if (role === "user" && mr.submitted_by_email === userEmail) {
      if (mr.status === "APPROVED")    { msg = `MR ${mr.mr_id} approved`; icon = "✅"; type = "success"; }
      if (mr.status === "REJECTED")    { msg = `MR ${mr.mr_id} rejected`; icon = "❌"; type = "danger"; }
      if (mr.status === "PENDING_HOD") { msg = `MR ${mr.mr_id} forwarded to HOD`; icon = "🔺"; type = "warning"; }
      if (mr.status === "ISSUED")      { msg = `Items issued for MR ${mr.mr_id}`; icon = "📦"; type = "success"; }
      if (mr.status === "IN_PROCESS")  { msg = `MR ${mr.mr_id} in process`; icon = "⏳"; type = "warning"; }
    } else if (role === "manager") {
      if (mr.status === "PENDING")     { msg = `New MR ${mr.mr_id} awaiting approval`; icon = "📋"; type = "info"; }
      if (mr.status === "ISSUED")      { msg = `MR ${mr.mr_id} issued — Job ${mr.job_no}`; icon = "✅"; type = "success"; }
    } else if (role === "hod") {
      if (mr.status === "PENDING_HOD") { msg = `MR ${mr.mr_id} needs HOD approval`; icon = "🔺"; type = "warning"; }
      if (mr.status === "ISSUED")      { msg = `MR ${mr.mr_id} issued — Job ${mr.job_no}`; icon = "✅"; type = "success"; }
    } else if (role === "supply_chain" || role === "sc_manager") {
      if (mr.status === "APPROVED")    { msg = `MR ${mr.mr_id} approved — ready to process`; icon = "📋"; type = "info"; }
      if (mr.status === "ISSUED")      { msg = `MR ${mr.mr_id} items issued`; icon = "✅"; type = "success"; }
    } else if (role === "warehouse") {
      if (mr.status === "APPROVED")    { msg = `MR ${mr.mr_id} ready for issuance`; icon = "📦"; type = "info"; }
    }

    if (msg) notifications.push({ mr_id:mr.mr_id, message:msg, icon, type, timestamp:updated, vessel:mr.vessel, job_no:mr.job_no, status:mr.status, mr });
  });

  return notifications.sort((a,b) => b.timestamp - a.timestamp).slice(0,20);
}

const typeColors = {
  success: { bg:"#e8f5e9", border:"#a5d6a7", color:G.success },
  danger:  { bg:"#fff5f5", border:"#f5c6c6", color:G.danger  },
  warning: { bg:"#fff8e1", border:"#ffe082", color:G.warning  },
  info:    { bg:G.pale,    border:G.paleBorder, color:G.primary },
};

export default function NotificationBell({ mrs, role, userEmail, accentColor, onNavigate }) {
  const [open, setOpen]     = useState(false);
  const [notifs, setNotifs] = useState([]);
  const color = accentColor || G.primary;

  useEffect(() => { setNotifs(getNotifications(mrs, role, userEmail)); }, [mrs, role, userEmail]);

  const handleOpen = () => {
    const newOpen = !open;
    setOpen(newOpen);
    if (newOpen && notifs.length > 0) {
      setTimeout(() => {
        const lastSeen = JSON.parse(localStorage.getItem("goltens_last_seen") || "{}");
        notifs.forEach(n => { lastSeen[n.mr_id] = Date.now(); });
        localStorage.setItem("goltens_last_seen", JSON.stringify(lastSeen));
        setNotifs([]);
      }, 1500);
    }
  };

  const handleNotifClick = (n) => {
    if (onNavigate) onNavigate(n.mr);
    setOpen(false);
    const lastSeen = JSON.parse(localStorage.getItem("goltens_last_seen") || "{}");
    lastSeen[n.mr_id] = Date.now();
    localStorage.setItem("goltens_last_seen", JSON.stringify(lastSeen));
    setNotifs(prev => prev.filter(x => x.mr_id !== n.mr_id));
  };

  const timeAgo = (ts) => {
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 1)    return "just now";
    if (diff < 60)   return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
    return `${Math.floor(diff/1440)}d ago`;
  };

  return (
    <div style={{ position:"relative", flexShrink:0 }}>
      <button style={{ ...s.bell }} onClick={handleOpen} title="Notifications">
        🔔
        {notifs.length > 0 && <span style={s.badge}>{notifs.length > 9 ? "9+" : notifs.length}</span>}
      </button>

      {open && (
        <div style={s.panel}>
          <div style={{ ...s.panelHeader, background:color }}>
            <span style={s.panelTitle}>🔔 Notifications</span>
            {notifs.length > 0 && <span style={s.panelSub}>{notifs.length} unread</span>}
          </div>
          {notifs.length === 0 ? (
            <div style={s.empty}>
              <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
              <div style={{ color:G.muted, fontSize:13 }}>All caught up!</div>
            </div>
          ) : (
            <div style={s.list}>
              {notifs.map((n, i) => {
                const tc = typeColors[n.type] || typeColors.info;
                return (
                  <div key={i} style={{ ...s.notif, background:tc.bg, borderLeft:`3px solid ${tc.border}` }}
                    onClick={() => handleNotifClick(n)}>
                    <div style={s.notifTop}>
                      <span style={{ fontSize:16 }}>{n.icon}</span>
                      <span style={{ ...s.notifMsg, color:tc.color }}>{n.message}</span>
                    </div>
                    <div style={s.notifMeta}>
                      {n.vessel && <span>{n.vessel}</span>}
                      {n.job_no && <span> · Job {n.job_no}</span>}
                      <span style={{ marginLeft:8 }}>{timeAgo(n.timestamp)}</span>
                    </div>
                    <div style={s.clickHint}>Click to open →</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  bell:        { position:"relative", background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, width:34, height:34, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  badge:       { position:"absolute", top:-5, right:-5, background:"#e53935", color:"#fff", borderRadius:"50%", width:18, height:18, fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid transparent" },
  panel:       { position:"absolute", top:"calc(100% + 8px)", right:0, width:310, background:"#fff", borderRadius:10, boxShadow:"0 8px 32px rgba(0,0,0,0.18)", zIndex:9999, overflow:"hidden", border:`1px solid ${G.paleBorder}` },
  panelHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px" },
  panelTitle:  { fontWeight:700, color:"#fff", fontSize:13 },
  panelSub:    { fontSize:11, color:"rgba(255,255,255,0.75)" },
  empty:       { padding:"28px 20px", textAlign:"center" },
  list:        { maxHeight:380, overflowY:"auto" },
  notif:       { padding:"10px 14px", borderBottom:`1px solid ${G.pale}`, cursor:"pointer", transition:"opacity 0.15s" },
  notifTop:    { display:"flex", alignItems:"center", gap:8, marginBottom:3 },
  notifMsg:    { fontSize:12, fontWeight:600, flex:1 },
  notifMeta:   { fontSize:11, color:G.muted, marginLeft:24 },
  clickHint:   { fontSize:10, color:G.muted, marginLeft:24, marginTop:3, fontStyle:"italic" },
};
