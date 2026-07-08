/**
 * SearchBar.jsx — Global MR search across all portals
 * Searches by MR ID, vessel, job number, submitted by name
 */
import { useState, useEffect, useRef } from "react";
import { G } from "./theme";

export default function SearchBar({ mrs = [], onSelect, placeholder = "Search MR number, vessel, job no…" }) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const ref                   = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    const q = query.toLowerCase();
    const matches = mrs.filter(m =>
      m.mr_id?.toLowerCase().includes(q) ||
      m.vessel?.toLowerCase().includes(q) ||
      m.job_no?.toLowerCase().includes(q) ||
      m.submitted_by_name?.toLowerCase().includes(q) ||
      m.department?.toLowerCase().includes(q)
    ).slice(0, 8);
    setResults(matches);
    setOpen(matches.length > 0);
  }, [query, mrs]);

  const statusColor = (st) => {
    if (st === "APPROVED" || st === "ISSUED")  return G.success;
    if (st === "REJECTED")                     return G.danger;
    if (st === "PENDING_HOD")                  return G.purple;
    if (st === "IN_PROCESS")                   return G.warning;
    return G.primary;
  };

  const handleSelect = (mr) => {
    onSelect(mr);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={ref} style={s.wrap}>
      <div style={s.inputWrap}>
        <span style={s.icon}>🔍</span>
        <input
          style={s.input}
          placeholder={placeholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {query && <button style={s.clear} onClick={() => { setQuery(""); setOpen(false); }}>✕</button>}
      </div>
      {open && (
        <div style={s.dropdown}>
          {results.map(mr => (
            <div key={mr.mr_id} style={s.item} onClick={() => handleSelect(mr)}>
              <div style={s.itemLeft}>
                <span style={s.mrId}>{mr.mr_id}</span>
                <span style={s.mrMeta}>{mr.vessel} · Job {mr.job_no} · {mr.submitted_by_name}</span>
              </div>
              <span style={{ ...s.badge, color: statusColor(mr.status) }}>
                {mr.status?.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap:      { position:"relative", flex:1, maxWidth:380 },
  inputWrap: { display:"flex", alignItems:"center", background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, padding:"0 10px", gap:8 },
  icon:      { fontSize:14, flexShrink:0 },
  input:     { flex:1, background:"transparent", border:"none", outline:"none", color:"#fff", fontSize:13, padding:"8px 0", fontFamily:"'Inter','Segoe UI',system-ui,Arial,sans-serif" },
  clear:     { background:"none", border:"none", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:13, padding:"0 2px" },
  dropdown:  { position:"absolute", top:"calc(100% + 6px)", left:0, right:0, background:"#fff", borderRadius:8, boxShadow:"0 8px 32px rgba(0,0,0,0.18)", zIndex:9999, overflow:"hidden", border:`1px solid ${G.paleBorder}` },
  item:      { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", cursor:"pointer", borderBottom:`1px solid ${G.pale}`, transition:"background 0.1s" },
  itemLeft:  { display:"flex", flexDirection:"column", gap:3 },
  mrId:      { fontWeight:700, fontSize:12, color:G.navy },
  mrMeta:    { fontSize:11, color:G.muted },
  badge:     { fontSize:10, fontWeight:700, background:G.pale, borderRadius:8, padding:"2px 8px" },
};
