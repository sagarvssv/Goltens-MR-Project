/**
 * FormTypeFilter.jsx
 * Shows form type filter tabs in all portals.
 * Always shows All Forms + Material Requisition + Form 2..Form 10
 * Forms with no data show as "Coming Soon" with count 0.
 */
import { G } from "./theme";

export const ALL_FORM_TYPES = [
  { key: "material_requisition", label: "Material Requisition", available: true  },
  { key: "form2",                label: "Form 2",               available: false },
  { key: "form3",                label: "Form 3",               available: false },
  { key: "form4",                label: "Form 4",               available: false },
  { key: "form5",                label: "Form 5",               available: false },
  { key: "form6",                label: "Form 6",               available: false },
  { key: "form7",                label: "Form 7",               available: false },
  { key: "form8",                label: "Form 8",               available: false },
  { key: "form9",                label: "Form 9",               available: false },
  { key: "form10",               label: "Form 10",              available: false },
];

export function filterByFormType(mrs, formType) {
  if (!formType || formType === "all") return mrs;
  return mrs.filter(m => (m.form_type || "material_requisition") === formType);
}

export default function FormTypeFilter({ mrs = [], selected, onChange, accentColor, compact = false }) {
  const color = accentColor || G.primary;

  const tabs = [
    {
      key:       "all",
      label:     "All Forms",
      count:     mrs.length,
      available: true,
    },
    ...ALL_FORM_TYPES.map(ft => ({
      key:       ft.key,
      label:     ft.label,
      count:     mrs.filter(m => (m.form_type || "material_requisition") === ft.key).length,
      available: ft.available,
    })),
  ];

  if (compact) {
    // Compact version for sidebars — horizontal scroll
    return (
      <div style={{ overflowX:"auto", paddingBottom:4 }}>
        <div style={{ display:"flex", gap:4, minWidth:"max-content" }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              disabled={!tab.available && tab.key !== "all"}
              style={{
                ...sc.tab,
                ...(selected === tab.key ? { ...sc.tabActive, background:color, borderColor:color } : {}),
                ...(!tab.available && tab.key !== "all" ? sc.tabDisabled : {}),
              }}
              onClick={() => tab.available || tab.key === "all" ? onChange(tab.key) : null}
              title={!tab.available && tab.key !== "all" ? "Coming Soon" : tab.label}
            >
              {tab.label}
              {tab.count > 0 && (
                <span style={{ ...sc.count, background: selected===tab.key?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.15)", color:"#fff" }}>
                  {tab.count}
                </span>
              )}
              {!tab.available && tab.key !== "all" && <span style={sc.soon}>⏳</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Full version for main content area
  return (
    <div style={s.wrap}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          disabled={!tab.available && tab.key !== "all"}
          style={{
            ...s.tab,
            ...(selected === tab.key ? { ...s.tabActive, background:color, borderColor:color } : {}),
            ...(!tab.available && tab.key !== "all" ? s.tabDisabled : {}),
          }}
          onClick={() => tab.available || tab.key === "all" ? onChange(tab.key) : null}
          title={!tab.available && tab.key !== "all" ? "Coming Soon" : undefined}
        >
          {tab.label}
          <span style={{
            ...s.count,
            background: selected===tab.key ? "rgba(255,255,255,0.25)" : G.pale,
            color:      selected===tab.key ? "#fff" : G.muted,
          }}>
            {tab.available || tab.key === "all" ? tab.count : "⏳"}
          </span>
        </button>
      ))}
    </div>
  );
}

// Full version styles
const s = {
  wrap:        { display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 },
  tab:         { display:"flex", alignItems:"center", gap:6, background:"#fff", border:`1px solid ${G.paleBorder}`, borderRadius:20, padding:"5px 14px", fontSize:12, cursor:"pointer", color:G.muted, fontWeight:600, transition:"all 0.15s" },
  tabActive:   { color:"#fff", fontWeight:700 },
  tabDisabled: { opacity:0.5, cursor:"not-allowed", background:"#f8f8f8" },
  count:       { borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 },
};

// Compact sidebar styles
const sc = {
  tab:         { display:"flex", alignItems:"center", gap:4, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:12, padding:"3px 10px", fontSize:10, cursor:"pointer", color:"rgba(255,255,255,0.85)", fontWeight:600, transition:"all 0.15s" },
  tabActive:   { color:"#fff", fontWeight:700 },
  tabDisabled: { opacity:0.45, cursor:"not-allowed" },
  count:       { borderRadius:8, padding:"1px 5px", fontSize:9, fontWeight:700 },
  soon:        { fontSize:9, marginLeft:2 },
};
