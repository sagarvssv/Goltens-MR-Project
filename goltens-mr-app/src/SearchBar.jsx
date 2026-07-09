/**
 * SearchBar.jsx — Global MR search with preview popup on result click
 */
import { useState, useEffect, useRef } from "react";
import { G } from "./theme";

export default function SearchBar({ mrs = [], onSelect, placeholder = "Search MR, vessel, job…" }) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const [preview, setPreview] = useState(null);
  const ref                   = useRef(null);
  const inputRef              = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setPreview(null); } };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); setPreview(null); return; }
    const q = query.toLowerCase();
    const matches = mrs.filter(m =>
      m.mr_id?.toLowerCase().includes(q) ||
      m.vessel?.toLowerCase().includes(q) ||
      m.job_no?.toLowerCase().includes(q) ||
      m.submitted_by_name?.toLowerCase().includes(q) ||
      m.department?.toLowerCase().includes(q) ||
      m.status?.toLowerCase().includes(q)
    ).slice(0, 8);
    setResults(matches);
    setOpen(matches.length > 0);
    setPreview(null);
  }, [query, mrs]);

  const statusColor = (st) => {
    if (st === "APPROVED" || st === "ISSUED")  return { bg:"#e8f5e9", color:G.success };
    if (st === "REJECTED")                     return { bg:"#fff5f5", color:G.danger };
    if (st === "PENDING_HOD")                  return { bg:"#f3e5f5", color:G.purple };
    if (st === "IN_PROCESS")                   return { bg:"#fff8e1", color:G.warning };
    return { bg:G.pale, color:G.primary };
  };

  const handleResultClick = (mr, e) => {
    e.stopPropagation();
    setPreview(mr);
  };

  const handleOpenForm = () => {
    if (preview) { onSelect(preview); setQuery(""); setOpen(false); setPreview(null); }
  };

  const sc = statusColor(preview?.status);

  return (
    <div ref={ref} style={{ position:"relative", width:260 }}>
      <div style={s.inputWrap}>
        <span style={s.icon}>🔍</span>
        <input
          ref={inputRef}
          style={s.input}
          placeholder={placeholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {query && <button style={s.clear} onClick={() => { setQuery(""); setOpen(false); setPreview(null); }}>✕</button>}
      </div>

      {/* Results dropdown */}
      {open && !preview && (
        <div style={s.dropdown}>
          {results.map(mr => {
            const sc2 = statusColor(mr.status);
            return (
              <div key={mr.mr_id} style={s.item} onClick={(e) => handleResultClick(mr, e)}>
                <div style={s.itemLeft}>
                  <span style={s.mrId}>{mr.mr_id}</span>
                  <span style={s.mrMeta}>{mr.vessel} · Job {mr.job_no}</span>
                </div>
                <span style={{ ...s.badge, background:sc2.bg, color:sc2.color }}>
                  {mr.status?.replace(/_/g," ")}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview popup */}
      {preview && (
        <div style={s.preview}>
          <div style={s.previewHeader}>
            <span style={s.previewId}>{preview.mr_id}</span>
            <button style={s.previewClose} onClick={() => { setPreview(null); setOpen(true); }}>✕</button>
          </div>
          <div style={s.previewGrid}>
            {[
              ["Vessel",      preview.vessel],
              ["Department",  preview.department||"—"],
              ["Job No.",     preview.job_no],
              ["Date",        preview.date_requested],
              ["Submitted By",preview.submitted_by_name],
              ["Total",       `AED ${parseFloat(preview.total_cost||0).toLocaleString("en-AE",{minimumFractionDigits:2})}`],
            ].map(([k,v]) => (
              <div key={k} style={s.previewCell}>
                <div style={s.previewLabel}>{k}</div>
                <div style={s.previewValue}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ ...s.previewStatus, background:sc.bg, color:sc.color }}>
            Status: {preview.status?.replace(/_/g," ")}
          </div>
          <button style={s.openBtn} onClick={handleOpenForm}>Open Full Form →</button>
        </div>
      )}
    </div>
  );
}

const s = {
  inputWrap:     { display:"flex", alignItems:"center", background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.25)", borderRadius:6, padding:"0 8px", gap:6 },
  icon:          { fontSize:13, flexShrink:0, opacity:0.8 },
  input:         { flex:1, background:"transparent", border:"none", outline:"none", color:"#fff", fontSize:12, padding:"7px 0", fontFamily:"'Inter','Segoe UI',system-ui,Arial,sans-serif", caretColor:"#fff", width:"100%" },
  clear:         { background:"none", border:"none", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:12 },
  dropdown:      { position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#fff", borderRadius:8, boxShadow:"0 8px 24px rgba(0,0,0,0.15)", zIndex:9999, overflow:"hidden", border:`1px solid ${G.paleBorder}` },
  item:          { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 12px", cursor:"pointer", borderBottom:`1px solid ${G.pale}`, transition:"background 0.1s" },
  itemLeft:      { display:"flex", flexDirection:"column", gap:2 },
  mrId:          { fontWeight:700, fontSize:12, color:G.navy },
  mrMeta:        { fontSize:11, color:G.muted },
  badge:         { fontSize:10, fontWeight:700, borderRadius:8, padding:"2px 8px", whiteSpace:"nowrap" },
  preview:       { position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#fff", borderRadius:8, boxShadow:"0 8px 24px rgba(0,0,0,0.18)", zIndex:9999, border:`1px solid ${G.paleBorder}`, padding:"14px" },
  previewHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 },
  previewId:     { fontWeight:800, fontSize:13, color:G.navy },
  previewClose:  { background:"none", border:"none", color:G.muted, cursor:"pointer", fontSize:14 },
  previewGrid:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px", marginBottom:10 },
  previewCell:   {},
  previewLabel:  { fontSize:9, fontWeight:600, color:G.muted, textTransform:"uppercase" },
  previewValue:  { fontSize:12, fontWeight:600, color:G.navy },
  previewStatus: { borderRadius:5, padding:"5px 10px", fontSize:11, fontWeight:700, marginBottom:10, textAlign:"center" },
  openBtn:       { width:"100%", background:G.primary, color:"#fff", border:"none", borderRadius:5, padding:"8px", fontSize:12, fontWeight:700, cursor:"pointer" },
};
