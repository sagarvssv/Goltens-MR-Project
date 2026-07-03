/**
 * FormSelector.jsx
 * Shown after login — user selects which form to fill before proceeding.
 * Supports up to 20 different form types.
 * Currently Form 1 (Material Requisition) is active; Form 2-10 are placeholders.
 */
import { G } from "./theme";
import GoltensLogo from "./GoltensLogo";

const FORMS = [
  {
    id:          "material_requisition",
    name:        "Material Requisition",
    shortName:   "MR Form",
    description: "Request materials, spare parts or store items for a vessel or project.",
    icon:        "📋",
    color:       G.primary,
    available:   true,
    formNo:      "FO-552-0201",
  },
  {
    id:          "form2",
    name:        "Form 2",
    shortName:   "Form 2",
    description: "Coming soon.",
    icon:        "📄",
    color:       "#888",
    available:   false,
    formNo:      "Form 2",
  },
  {
    id:          "form3",
    name:        "Form 3",
    shortName:   "Form 3",
    description: "Coming soon.",
    icon:        "📄",
    color:       "#888",
    available:   false,
    formNo:      "Form 3",
  },
  {
    id:          "form4",
    name:        "Form 4",
    shortName:   "Form 4",
    description: "Coming soon.",
    icon:        "📄",
    color:       "#888",
    available:   false,
    formNo:      "Form 4",
  },
  {
    id:          "form5",
    name:        "Form 5",
    shortName:   "Form 5",
    description: "Coming soon.",
    icon:        "📄",
    color:       "#888",
    available:   false,
    formNo:      "Form 5",
  },
  {
    id:          "form6",
    name:        "Form 6",
    shortName:   "Form 6",
    description: "Coming soon.",
    icon:        "📄",
    color:       "#888",
    available:   false,
    formNo:      "Form 6",
  },
  {
    id:          "form7",
    name:        "Form 7",
    shortName:   "Form 7",
    description: "Coming soon.",
    icon:        "📄",
    color:       "#888",
    available:   false,
    formNo:      "Form 7",
  },
  {
    id:          "form8",
    name:        "Form 8",
    shortName:   "Form 8",
    description: "Coming soon.",
    icon:        "📄",
    color:       "#888",
    available:   false,
    formNo:      "Form 8",
  },
  {
    id:          "form9",
    name:        "Form 9",
    shortName:   "Form 9",
    description: "Coming soon.",
    icon:        "📄",
    color:       "#888",
    available:   false,
    formNo:      "Form 9",
  },
  {
    id:          "form10",
    name:        "Form 10",
    shortName:   "Form 10",
    description: "Coming soon.",
    icon:        "📄",
    color:       "#888",
    available:   false,
    formNo:      "Form 10",
  },
];

export default function FormSelector({ session, onSelect, onLogout }) {
  return (
    <div style={s.page}>
      {/* Top bar */}
      <div style={s.topBar}>
        <GoltensLogo size="md" />
        <div style={s.topRight}>
          <span style={s.userTag}>👤 {session.name || session.email}</span>
          <button style={s.logoutBtn} onClick={onLogout}>Log Out</button>
        </div>
      </div>

      <div style={s.content}>
        <div style={s.heading}>Select a Form</div>
        <div style={s.subheading}>Choose the form you want to fill and submit.</div>

        <div style={s.grid}>
          {FORMS.map(form => (
            <div
              key={form.id}
              style={{
                ...s.card,
                ...(form.available ? s.cardAvailable : s.cardDisabled),
              }}
              onClick={() => form.available && onSelect(form.id)}
            >
              {/* Top color bar */}
              <div style={{ ...s.cardBar, background: form.color }} />

              <div style={s.cardBody}>
                <div style={s.cardIcon}>{form.icon}</div>
                <div style={s.cardName}>{form.name}</div>
                <div style={s.cardFormNo}>{form.formNo}</div>
                <div style={s.cardDesc}>{form.description}</div>
              </div>

              <div style={s.cardFooter}>
                {form.available ? (
                  <div style={{ ...s.cardStatus, ...s.cardStatusActive }}>● Available</div>
                ) : (
                  <div style={{ ...s.cardStatus, ...s.cardStatusSoon }}>⏳ Coming Soon</div>
                )}
                {form.available && (
                  <button style={{ ...s.selectBtn, background: form.color }}>
                    Open Form →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const s = {
  page:            { minHeight:"100vh", background:`linear-gradient(160deg, ${G.pale} 0%, #f0f4f8 100%)`, fontFamily:"'Segoe UI', Arial, sans-serif" },
  topBar:          { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 32px", background:G.white, borderBottom:`1px solid ${G.paleBorder}`, boxShadow:"0 2px 8px rgba(0,0,0,0.06)" },
  topRight:        { display:"flex", alignItems:"center", gap:12 },
  userTag:         { background:G.pale, color:G.navy, borderRadius:20, padding:"5px 16px", fontSize:12, fontWeight:600, border:`1px solid ${G.paleBorder}` },
  logoutBtn:       { background:"none", border:`1px solid ${G.paleBorder}`, borderRadius:5, padding:"5px 14px", fontSize:12, cursor:"pointer", color:G.muted },
  content:         { maxWidth:1100, margin:"0 auto", padding:"40px 24px" },
  heading:         { fontSize:26, fontWeight:700, color:G.navy, marginBottom:8 },
  subheading:      { fontSize:14, color:G.muted, marginBottom:32 },
  grid:            { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:20 },
  card:            { borderRadius:10, background:G.white, boxShadow:"0 2px 12px rgba(0,0,0,0.08)", overflow:"hidden", display:"flex", flexDirection:"column", transition:"transform 0.15s, box-shadow 0.15s" },
  cardAvailable:   { cursor:"pointer", border:`1px solid ${G.paleBorder}` },
  cardDisabled:    { cursor:"not-allowed", opacity:0.55, border:"1px solid #e0e0e0" },
  cardBar:         { height:5 },
  cardBody:        { padding:"18px 16px 12px", flex:1 },
  cardIcon:        { fontSize:32, marginBottom:10 },
  cardName:        { fontWeight:700, fontSize:14, color:G.navy, marginBottom:4 },
  cardFormNo:      { fontSize:10, color:G.muted, marginBottom:8, fontWeight:600, textTransform:"uppercase", letterSpacing:0.5 },
  cardDesc:        { fontSize:12, color:"#666", lineHeight:1.5 },
  cardFooter:      { padding:"10px 16px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", borderTop:`1px solid ${G.pale}` },
  cardStatus:      { fontSize:11, fontWeight:600 },
  cardStatusActive:{ color:G.success },
  cardStatusSoon:  { color:"#aaa" },
  selectBtn:       { color:"#fff", border:"none", borderRadius:5, padding:"5px 12px", fontSize:11, fontWeight:700, cursor:"pointer" },
};
