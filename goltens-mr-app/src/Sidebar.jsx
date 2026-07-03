/**
 * Sidebar.jsx — shared branded sidebar for all portals
 * Props: color (hex), label (string), navItems, mrQueue, selected, onSelect, footer
 */
import GoltensLogo from "./GoltensLogo";

export default function Sidebar({ color, label, navItems=[], mrQueue=[], selected, onSelect, footer, pendingCount }) {
  return (
    <div style={{ width:268, background:color, color:"#fff", display:"flex", flexDirection:"column", padding:"0 0 16px", flexShrink:0 }}>
      {/* Logo header */}
      <div style={{ padding:"20px 20px 16px", borderBottom:"1px solid rgba(255,255,255,0.15)" }}>
        <GoltensLogo size="sm" dark style={{ marginBottom:4 }} />
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", marginTop:4, paddingLeft:2 }}>{label}</div>
      </div>

      {/* Nav items */}
      {navItems.length > 0 && (
        <>
          <div style={hd}>NAVIGATION</div>
          {navItems.map(({ key, label: l, active, onClick }) => (
            <div key={key} style={{ ...ni, ...(active ? na : {}) }} onClick={onClick}>{l}</div>
          ))}
        </>
      )}

      {/* MR Queue */}
      {mrQueue.length > 0 && (
        <>
          <div style={hd}>QUEUE</div>
          {mrQueue.map(mr => (
            <div key={mr.mr_id} style={{ ...mc, ...(selected?.mr_id === mr.mr_id ? mca : {}) }} onClick={() => onSelect(mr)}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontWeight:700, fontSize:12, color:"#fff" }}>{mr.mr_id}</div>
                {mr.document_s3_keys?.length > 0 && <div style={db}>📎{mr.document_s3_keys.length}</div>}
              </div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", marginTop:3 }}>{mr.vessel} · {mr.submitted_by_name}</div>
              <div style={{ display:"inline-block", marginTop:5, fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10, background:"rgba(255,255,255,0.18)", color:"rgba(255,255,255,0.9)" }}>
                {mr.status?.replace("_"," ")}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Footer */}
      <div style={{ marginTop:"auto", padding:"16px 20px 0", borderTop:"1px solid rgba(255,255,255,0.12)", display:"flex", flexDirection:"column", gap:8 }}>
        {pendingCount !== undefined && <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>{pendingCount} pending review</div>}
        {footer}
      </div>
    </div>
  );
}

const hd = { fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.45)", letterSpacing:1.5, padding:"16px 20px 6px" };
const ni = { margin:"2px 12px", padding:"9px 12px", borderRadius:6, cursor:"pointer", fontSize:13, color:"rgba(255,255,255,0.8)" };
const na = { background:"rgba(255,255,255,0.2)", color:"#fff", fontWeight:600 };
const mc = { margin:"2px 12px", padding:"10px 12px", borderRadius:6, cursor:"pointer" };
const mca= { background:"rgba(255,255,255,0.15)" };
const db = { fontSize:10, color:"rgba(255,255,255,0.75)", background:"rgba(255,255,255,0.18)", borderRadius:10, padding:"1px 7px" };
