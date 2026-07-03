/**
 * MRStageTracker.jsx
 * Shows which stage an MR is currently at.
 * Used in all portals.
 */
export default function MRStageTracker({ status }) {
  const stages = [
    { key: "PENDING",     label: "Manager Review" },
    { key: "PENDING_HOD", label: "HOD Review"     },
    { key: "APPROVED",    label: "Approved"       },
    { key: "IN_PROCESS",  label: "In Process"     },
    { key: "ISSUED",      label: "Issued"         },
  ];

  const rejectedOrReverted = status === "REJECTED" || status === "REVERTED";
  const currentIdx = stages.findIndex(s => s.key === status);

  return (
    <div style={t.wrap}>
      <div style={t.label}>Current Stage</div>
      {rejectedOrReverted ? (
        <div style={t.rejected}>✕ MR {status}</div>
      ) : (
        <div style={t.track}>
          {stages.map((stage, i) => {
            const done    = currentIdx > i;
            const active  = currentIdx === i;
            const pending = currentIdx < i;
            return (
              <div key={stage.key} style={t.step}>
                <div style={{ ...t.dot, ...(active ? t.dotActive : done ? t.dotDone : t.dotPending) }}>
                  {done ? "✓" : i + 1}
                </div>
                <div style={{ ...t.stepLabel, ...(active ? t.stepLabelActive : done ? t.stepLabelDone : t.stepLabelPending) }}>
                  {stage.label}
                </div>
                {i < stages.length - 1 && (
                  <div style={{ ...t.line, ...(done ? t.lineDone : t.linePending) }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const t = {
  wrap: { background:"#f7f9fc", border:"1px solid #e0eaf4", borderRadius:8, padding:"12px 16px", marginBottom:20 },
  label: { fontSize:10, fontWeight:700, color:"#5a7a96", textTransform:"uppercase", letterSpacing:1, marginBottom:10 },
  track: { display:"flex", alignItems:"flex-start", gap:0 },
  step: { display:"flex", flexDirection:"column", alignItems:"center", position:"relative", flex:1 },
  dot: { width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, zIndex:1, position:"relative" },
  dotActive:  { background:"#1B6CA8", color:"#fff", boxShadow:"0 0 0 3px #b8d4e8" },
  dotDone:    { background:"#1a7a4a", color:"#fff" },
  dotPending: { background:"#e8ecf0", color:"#aaa" },
  stepLabel: { fontSize:10, textAlign:"center", marginTop:5, maxWidth:80 },
  stepLabelActive:  { color:"#1B6CA8", fontWeight:700 },
  stepLabelDone:    { color:"#1a7a4a", fontWeight:600 },
  stepLabelPending: { color:"#aaa" },
  line: { position:"absolute", top:14, left:"calc(50% + 14px)", width:"calc(100% - 28px)", height:2, zIndex:0 },
  lineDone:    { background:"#1a7a4a" },
  linePending: { background:"#e0e0e0" },
  rejected: { background:"#fff5f5", border:"1px solid #f5c6c6", borderRadius:6, padding:"8px 14px", color:"#c0392b", fontWeight:700, fontSize:13, display:"inline-block" },
};
