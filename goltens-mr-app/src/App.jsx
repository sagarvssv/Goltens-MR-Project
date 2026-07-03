import { useState } from "react";
import MRForm from "./MRForm";
import ManagerPortal from "./ManagerPortal";
import SupplyChainPortal from "./SupplyChainPortal";
import HODPortal from "./HODPortal";
import WarehousePortal from "./WarehousePortal";
import FormSelector from "./FormSelector";
import GoltensLogo from "./GoltensLogo";
import { getUserProfile } from "./api";
import { G } from "./theme";

const CREDENTIALS = [
  { email: "shashikanth.k@vcloudmaster.com", password: "user123",    role: "user",         name: "Shashikanth" },
  { email: "prapul.t@vcloudmaster.com",      password: "manager123", role: "manager",      name: "Prapul"      },
  { email: "swapna.m@vcloudmaster.com",      password: "hod123",     role: "hod",          name: "Swapna"      },
  { email: "hasini.b@vcloudmaster.com",      password: "sc123",      role: "supply_chain", name: "Hasini"      },
  { email: "shabeer.a@vcloudmaster.com",     password: "wh123",      role: "warehouse",    name: "Shabeer"     },
];

export const MANAGER_EMAIL = "prapul.t@vcloudmaster.com";
export const HOD_EMAIL     = "swapna.m@vcloudmaster.com";
export const SC_EMAIL      = "hasini.b@vcloudmaster.com";
export const APPROVAL_SLAB = 5000;

export default function App() {
  const [session, setSession]       = useState(null);
  const [selectedForm, setSelectedForm] = useState(null); // null = form selector not passed yet
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  const handleLogin = async () => {
    setError("");
    if (!email.trim() || !password.trim()) { setError("Please enter your email and password."); return; }
    setLoading(true);
    const cred = CREDENTIALS.find(c => c.email === email.toLowerCase() && c.password === password);
    if (!cred) { setError("Invalid email or password."); setLoading(false); return; }
    try {
      const profile = await getUserProfile(email.toLowerCase());
      setSession({
        email:      email.toLowerCase(),
        role:       cred.role,
        name:       profile?.name || cred.name || "",
        id_no:      profile?.id_no || "",
        department: profile?.department || "",
      });
    } catch {
      setSession({ email: email.toLowerCase(), role: cred.role, name: cred.name, id_no: "", department: "" });
    }
    setLoading(false);
  };

  const handleLogout = () => {
    setSession(null); setSelectedForm(null); setEmail(""); setPassword(""); setError("");
  };

  const handleFormSelect = (formId) => {
    setSelectedForm(formId);
  };

  const handleBackToSelector = () => {
    setSelectedForm(null);
  };

  // ── Routed portals — manager, HOD, SC, warehouse skip form selector ──
  if (session) {
    if (session.role === "manager")      return <ManagerPortal session={session} onLogout={handleLogout} />;
    if (session.role === "supply_chain") return <SupplyChainPortal session={session} onLogout={handleLogout} />;
    if (session.role === "hod")          return <HODPortal session={session} onLogout={handleLogout} />;
    if (session.role === "warehouse")    return <WarehousePortal session={session} onLogout={handleLogout} />;

    // ── User role: show form selector first, then selected form ──
    if (session.role === "user") {
      if (!selectedForm) {
        return <FormSelector session={session} onSelect={handleFormSelect} onLogout={handleLogout} />;
      }
      // Route to the correct form based on selection
      if (selectedForm === "material_requisition") {
        return (
          <MRForm
            session={session}
            managerEmail={MANAGER_EMAIL}
            hodEmail={HOD_EMAIL}
            approvalSlab={APPROVAL_SLAB}
            formType={selectedForm}
            onLogout={handleLogout}
            onBack={handleBackToSelector}
          />
        );
      }
      // Placeholder for future forms
      return (
        <div style={ph.page}>
          <div style={ph.card}>
            <GoltensLogo size="md" style={{ marginBottom: 20 }} />
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
            <h2 style={{ color: G.navy }}>Form Coming Soon</h2>
            <p style={{ color: G.muted }}>This form is not yet available. Please check back later.</p>
            <button style={ph.btn} onClick={handleBackToSelector}>← Back to Form Selection</button>
          </div>
        </div>
      );
    }
  }

  // ── Login page ──
  return (
    <div style={s.page}>
      <div style={s.banner}>
        <GoltensLogo size="md" dark />
        <span style={s.bannerTag}>Material Requisition Portal</span>
      </div>
      <div style={s.card}>
        <GoltensLogo size="lg" style={{ marginBottom: 28, justifyContent: "center" }} />
        <h2 style={s.title}>Sign In</h2>
        <p style={s.sub}>Access your portal to submit or review material requisitions.</p>
        <div style={s.fieldGroup}>
          <label style={s.label}>Email Address</label>
          <input style={s.input} type="email" placeholder="yourname@vcloudmaster.com"
            value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()} />
        </div>
        <div style={s.fieldGroup}>
          <label style={s.label}>Password</label>
          <input style={s.input} type="password" placeholder="••••••••"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()} />
        </div>
        {error && <div style={s.errMsg}>{error}</div>}
        <button style={s.loginBtn} onClick={handleLogin} disabled={loading}>
          {loading ? "Signing in…" : "Sign In"}
        </button>
        <div style={s.hintBox}>
          <div style={s.hintTitle}>Demo credentials</div>
          {[
            ["User",         "Shashikanth", "shashikanth.k@vcloudmaster.com", "user123"],
            ["Manager",      "Prapul",      "prapul.t@vcloudmaster.com",      "manager123"],
            ["GM / HOD",     "Swapna",      "swapna.m@vcloudmaster.com",      "hod123"],
            ["Supply Chain", "Hasini",      "hasini.b@vcloudmaster.com",      "sc123"],
            ["Warehouse",    "Shabeer",     "shabeer.a@vcloudmaster.com",     "wh123"],
          ].map(([role, name, em, pw]) => (
            <div key={role} style={s.hintRow}>
              <span style={s.hintRole}>{role}</span>
              <span style={s.hintName}>{name}</span>
              <span style={s.hintEmail}>{em}</span>
              <span style={s.hintPw}>· {pw}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={s.footer}>© 2026 Goltens Co. Ltd. Dubai Branch — VCloudmaster FZE LLC</div>
    </div>
  );
}

const ph = {
  page: { minHeight:"100vh", background:G.pale, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Segoe UI', Arial, sans-serif" },
  card: { background:"#fff", borderRadius:12, padding:"48px 56px", textAlign:"center", boxShadow:"0 4px 24px rgba(0,0,0,0.1)", maxWidth:400 },
  btn:  { marginTop:24, background:G.primary, color:"#fff", border:"none", borderRadius:6, padding:"10px 24px", fontSize:13, fontWeight:600, cursor:"pointer" },
};

const s = {
  page:      { minHeight:"100vh", background:`linear-gradient(135deg, ${G.navy} 0%, ${G.primary} 60%, ${G.steel} 100%)`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Segoe UI', Arial, sans-serif", padding:"20px 16px" },
  banner:    { display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", maxWidth:540, marginBottom:24, padding:"0 4px" },
  bannerTag: { color:"rgba(255,255,255,0.75)", fontSize:13, fontStyle:"italic" },
  card:      { background:G.white, borderRadius:12, boxShadow:"0 8px 40px rgba(0,0,0,0.25)", padding:"36px 40px 32px", width:"100%", maxWidth:540 },
  title:     { fontSize:22, fontWeight:700, color:G.navy, marginBottom:6, textAlign:"center" },
  sub:       { fontSize:12, color:G.muted, marginBottom:24, textAlign:"center" },
  fieldGroup:{ marginBottom:16 },
  label:     { display:"block", fontSize:12, fontWeight:600, color:G.navy, marginBottom:5 },
  input:     { width:"100%", border:`1.5px solid ${G.paleBorder}`, borderRadius:6, padding:"10px 12px", fontSize:13, outline:"none", boxSizing:"border-box" },
  errMsg:    { background:G.dangerBg, color:G.danger, border:`1px solid #f5c6c6`, borderRadius:4, padding:"8px 12px", fontSize:12, marginBottom:14 },
  loginBtn:  { width:"100%", background:`linear-gradient(135deg, ${G.primary}, ${G.navy})`, color:G.white, border:"none", borderRadius:6, padding:"12px", fontSize:14, fontWeight:700, cursor:"pointer", marginBottom:20 },
  hintBox:   { background:G.pale, borderRadius:8, padding:"14px 16px", border:`1px solid ${G.paleBorder}` },
  hintTitle: { fontWeight:700, color:G.navy, marginBottom:8, textTransform:"uppercase", letterSpacing:0.5, fontSize:10 },
  hintRow:   { display:"flex", alignItems:"center", gap:6, marginBottom:5, fontSize:11 },
  hintRole:  { background:G.primary, color:G.white, borderRadius:10, padding:"2px 10px", fontSize:10, fontWeight:700, minWidth:82, textAlign:"center" },
  hintName:  { color:G.navy, fontWeight:700, minWidth:72 },
  hintEmail: { color:G.muted, fontWeight:400, flex:1 },
  hintPw:    { color:G.muted },
  footer:    { marginTop:24, color:"rgba(255,255,255,0.5)", fontSize:11, textAlign:"center" },
};
