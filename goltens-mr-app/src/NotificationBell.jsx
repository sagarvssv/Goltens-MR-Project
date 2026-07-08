/**
 * NotificationBell.jsx
 * Shows unread MR activity based on status changes in the last 24 hours.
 * Uses localStorage to track last-seen timestamps per MR.
 */
import { useState, useEffect } from "react";
import { G } from "./theme";

function getNotifications(mrs, role, userEmail) {
  const now    = Date.now();
  const cutoff = now - (24 * 60 * 60 * 1000); // last 24 hours
  const lastSeen = JSON.parse(localStorage.getItem("goltens_last_seen") || "{}");
  const notifications = [];

  mrs.forEach(mr => {
    const updated = new Date(mr.updated_at || mr.created_at).getTime();
    if (updated < cutoff) return;

    const seenAt = lastSeen[mr.mr_id] || 0;
    if (updated <= seenAt) return;

    // Filter by role relevance
    let msg = "";
    if (role === "user" && mr.submitted_by_email === userEmail) {
      if (mr.status === "APPROVED")    msg = `✓ MR ${mr.mr_id} approved`;
      if (mr.status === "REJECTED")    msg = `✕ MR ${mr.mr_id} rejected — ${mr.rejection_reason || ""}`;
      if (mr.status === "PENDING_HOD") msg = `🔺 MR ${mr.mr_id} forwarded to HOD`;
      if (mr.status === "ISSUED")      msg = `📦 Items issued for MR ${mr.mr_id}`;
      if (mr.status === "IN_PROCESS")  msg = `⏳ MR ${mr.mr_id} in process — stock pending`;
    } else if (role === "manager") {
      if (mr.status === "PENDING")     msg = `📋 New MR ${mr.mr_id} awaiting your approval`;
      if (mr.status === "ISSUED")      msg = `✓ MR ${mr.mr_id} issued — Job ${mr.job_no}`;
    } else if (role === "hod") {
      if (mr.status === "PENDING_HOD") msg = `🔺 MR ${mr.mr_id} needs HOD approval`;
      if (mr.status === "ISSUED")      msg = `✓ MR ${mr.mr_id} issued — Job ${mr.job_no}`;
    } else if (role === "supply_chain" || role === "sc_manager") {
      if (mr.status === "APPROVED")    msg = `📋 MR ${mr.mr_id} approved — ready to process`;
      if (mr.status === "ISSUED")      msg = `✓ MR ${mr.mr_id} items issued`;
    } else if (role === "warehouse") {
      if (mr.status === "APPROVED")    msg = `📦 MR ${mr.mr_id} ready for issuance`;
    }

    if (msg) {
      notifications.push({
        mr_id:     mr.mr_id,
        message:   msg,
        timestamp: updated,
        status:    mr.status,
        vessel:    mr.vessel,
        job_no:    mr.job_no,
      });
    }
  });

  return notifications.sort((a,b) => b.timestamp - a.timestamp).slice(0, 20);
}

export default function NotificationBell({ mrs, role, userEmail, accentColor }) {
  const [open, setOpen]   = useState(false);
  const [notifs, setNotifs] = useState([]);
  const color = accentColor || G.primary;

  useEffect(() => {
    setNotifs(getNotifications(mrs, role, userEmail));
  }, [mrs, role, userEmail]);

  const markAllRead = () => {
    const lastSeen = JSON.parse(localStorage.getItem("goltens_last_seen") || "{}");
    notifs.forEach(n => { lastSeen[n.mr_id] = Date.now(); });
    localStorage.setItem("goltens_last_seen", JSON.stringify(lastSeen));
    setNotifs([]);
    setOpen(false);
  };

  // Auto-mark as read when panel is opened
  const handleOpen = () => {
    const newOpen = !open;
    setOpen(newOpen);
    if (newOpen && notifs.length > 0) {
      // Small delay so user sees the count briefly before it clears
      setTimeout(() => {
        const lastSeen = JSON.parse(localStorage.getItem("goltens_last_seen") || "{}");
        notifs.forEach(n => { lastSeen[n.mr_id] = Date.now(); });
        localStorage.setItem("goltens_last_seen", JSON.stringify(lastSeen));
        setNotifs([]);
      }, 1500);
    }
  };

  const timeAgo = (ts) => {
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 1)  return "just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
    return `${Math.floor(diff/1440)}d ago`;
  };

  return (
    <div style={{ position:"relative" }}>
      <button style={{ ...s.bell, background: open ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)" }}
        onClick={handleOpen} title="Notifications">
        🔔
        {notifs.length > 0 && <span style={s.badge}>{notifs.length > 9 ? "9+" : notifs.length}</span>}
      </button>

      {open && (
        <div style={s.panel}>
          <div style={{ ...s.panelHeader, background: color }}>
            <span style={s.panelTitle}>Notifications</span>
            {notifs.length > 0 && (
              <button style={s.markRead} onClick={markAllRead}>Mark all read</button>
            )}
          </div>
          {notifs.length === 0 ? (
            <div style={s.empty}>
              <div style={{ fontSize:32, marginBottom:8 }}>🔔</div>
              <div style={{ color:G.muted, fontSize:13 }}>No new notifications</div>
            </div>
          ) : (
            <div style={s.list}>
              {notifs.map((n, i) => (
                <div key={i} style={s.notif}>
                  <div style={s.notifMsg}>{n.message}</div>
                  <div style={s.notifMeta}>
                    {n.vessel && <span>{n.vessel}</span>}
                    {n.job_no && <span> · Job {n.job_no}</span>}
                    <span style={{ marginLeft:8, color:G.muted }}>{timeAgo(n.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  bell:        { position:"relative", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, width:36, height:36, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" },
  badge:       { position:"absolute", top:-6, right:-6, background:"#e53935", color:"#fff", borderRadius:"50%", width:18, height:18, fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid #1A3A5C" },
  panel:       { position:"absolute", top:"calc(100% + 8px)", right:0, width:320, background:"#fff", borderRadius:10, boxShadow:"0 8px 32px rgba(0,0,0,0.18)", zIndex:9999, overflow:"hidden", border:`1px solid ${G.paleBorder}` },
  panelHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px" },
  panelTitle:  { fontWeight:700, color:"#fff", fontSize:14 },
  markRead:    { background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", borderRadius:4, padding:"3px 10px", fontSize:11, cursor:"pointer" },
  empty:       { padding:"32px 20px", textAlign:"center" },
  list:        { maxHeight:360, overflowY:"auto" },
  notif:       { padding:"10px 16px", borderBottom:`1px solid ${G.pale}`, cursor:"pointer" },
  notifMsg:    { fontSize:12, fontWeight:600, color:G.navy, marginBottom:3 },
  notifMeta:   { fontSize:11, color:G.muted },
};