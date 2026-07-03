/**
 * FormSelectionModal.jsx
 * Modal shown when Manager or HOD clicks "Submit New Form"
 * Lets them pick which form to submit.
 */
import { G } from "./theme";
import { ALL_FORM_TYPES } from "./FormTypeFilter";

export default function FormSelectionModal({ onSelect, onClose, portalColor }) {
  const color = portalColor || G.primary;

  return (
    <div style={s.overlay} onMouseDown={onClose}>
      <div style={s.modal} onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ ...s.header, background: color }}>
          <div>
            <div style={s.headerTitle}>Select Form to Submit</div>
            <div style={s.headerSub}>Choose which form you would like to fill and submit</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Form grid */}
        <div style={s.body}>
          <div style={s.grid}>
            {ALL_FORM_TYPES.map(form => (
              <div
                key={form.key}
                style={{
                  ...s.card,
                  ...(form.available ? s.cardAvailable : s.cardDisabled),
                }}
                onClick={() => form.available && onSelect(form.key)}
              >
                <div style={{ ...s.cardBar, background: form.available ? color : "#ccc" }} />
                <div style={s.cardBody}>
                  <div style={s.cardIcon}>{form.available ? "📋" : "📄"}</div>
                  <div style={{ ...s.cardName, color: form.available ? color : "#999" }}>
                    {form.label}
                  </div>
                  {form.available
                    ? <div style={s.cardAvailTag}>● Available</div>
                    : <div style={s.cardSoonTag}>⏳ Coming Soon</div>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay:      { position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" },
  modal:        { background:"#fff", borderRadius:12, width:"90vw", maxWidth:760, maxHeight:"85vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 12px 48px rgba(0,0,0,0.25)" },
  header:       { display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"20px 24px", flexShrink:0 },
  headerTitle:  { fontWeight:700, color:"#fff", fontSize:18 },
  headerSub:    { fontSize:12, color:"rgba(255,255,255,0.75)", marginTop:4 },
  closeBtn:     { background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", borderRadius:"50%", width:30, height:30, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  body:         { flex:1, overflow:"auto", padding:"24px" },
  grid:         { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(130px, 1fr))", gap:14 },
  card:         { borderRadius:8, background:"#fff", border:"1px solid #e8e8e8", overflow:"hidden", display:"flex", flexDirection:"column", transition:"transform 0.15s, box-shadow 0.15s" },
  cardAvailable:{ cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.06)" },
  cardDisabled: { cursor:"not-allowed", opacity:0.5 },
  cardBar:      { height:4 },
  cardBody:     { padding:"14px 12px", textAlign:"center" },
  cardIcon:     { fontSize:28, marginBottom:8 },
  cardName:     { fontWeight:700, fontSize:13, marginBottom:8 },
  cardAvailTag: { fontSize:10, fontWeight:600, color:"#1a7a4a" },
  cardSoonTag:  { fontSize:10, fontWeight:600, color:"#aaa" },
  footer:       { padding:"12px 24px", borderTop:"1px solid #eee", display:"flex", justifyContent:"flex-end", flexShrink:0 },
  cancelBtn:    { background:"#f0f0f0", border:"1px solid #ddd", borderRadius:5, padding:"8px 20px", fontSize:13, cursor:"pointer", color:"#555" },
};
