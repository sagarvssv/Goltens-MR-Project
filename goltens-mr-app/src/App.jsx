import { useState, useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { extractSession, cognitoLogout } from "./auth";
import { setAuthToken } from "./api";
import MRForm from "./MRForm";
import ManagerPortal from "./ManagerPortal";
import SupplyChainPortal from "./SupplyChainPortal";
import HODPortal from "./HODPortal";
import WarehousePortal from "./WarehousePortal";
import SCManagerPortal from "./SCManagerPortal";
import FormSelector from "./FormSelector";
import GoltensLogo from "./GoltensLogo";
import { G } from "./theme";

export const MANAGER_EMAIL   = "pramod.r@goltens.com";
export const HOD_EMAIL       = "gineesh.kg@goltens.com";
export const SC_EMAIL        = "nithya.prabhakar@goltens.com";
export const SC_MGR_EMAIL    = "girish.malhotra@goltens.com";
export const APPROVAL_SLAB   = 5000;
export const SLA_PENDING     = 2;
export const SLA_PENDING_HOD = 3;
export const SLA_APPROVED    = 5;

export default function App() {
  const auth                                  = useAuth();
  const [selectedForm, setSelectedForm]       = useState(null);

  // Extract session from Cognito user
  const session = extractSession(auth.user);

  // Set auth token for API calls whenever user changes
  if (auth.user?.id_token) {
    setAuthToken(auth.user.id_token);
  }

  // Handle logout
  const handleLogout = async () => {
    await auth.removeUser();
    cognitoLogout(window.location.origin);
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (auth.isLoading) {
    return (
      <div style={s.loadPage}>
        <GoltensLogo size="lg" dark style={{ marginBottom: 24 }}/>
        <div style={s.spinner}/>
        <div style={{ color:"rgba(255,255,255,0.7)", fontSize:14, marginTop:16 }}>
          Authenticating…
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (auth.error) {
    return (
      <div style={s.loadPage}>
        <div style={s.errCard}>
          <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
          <div style={{ color:"#c0392b", fontWeight:600, marginBottom:8 }}>Authentication Error</div>
          <div style={{ color:G.muted, fontSize:12, marginBottom:20 }}>{auth.error.message}</div>
          <button style={s.loginBtn} onClick={() => auth.signinRedirect()}>Try Again</button>
        </div>
      </div>
    );
  }

  // ── Authenticated ─────────────────────────────────────────────────────────
  if (auth.isAuthenticated && session) {
    // Role not set — show error
    if (!session.role) {
      return (
        <div style={s.loadPage}>
          <div style={s.errCard}>
            <GoltensLogo size="md" style={{ marginBottom:20, justifyContent:"center" }}/>
            <div style={{ fontSize:32, marginBottom:12 }}>🔒</div>
            <div style={{ color:G.navy, fontWeight:700, marginBottom:8 }}>Account Not Configured</div>
            <div style={{ color:G.muted, fontSize:13, marginBottom:20 }}>
              Your account ({session.email}) does not have a portal role assigned.<br/>
              Please contact your administrator.
            </div>
            <button style={{ ...s.loginBtn, background:"#e0e0e0", color:G.navy }} onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </div>
      );
    }

    // Route to portal based on role
    if (session.role === "manager")      return <ManagerPortal     session={session} onLogout={handleLogout}/>;
    if (session.role === "supply_chain") return <SupplyChainPortal session={session} onLogout={handleLogout}/>;
    if (session.role === "hod")          return <HODPortal          session={session} onLogout={handleLogout}/>;
    if (session.role === "warehouse")    return <WarehousePortal    session={session} onLogout={handleLogout}/>;
    if (session.role === "sc_manager")   return <SCManagerPortal    session={session} onLogout={handleLogout}/>;

    if (session.role === "user") {
      if (!selectedForm) {
        return <FormSelector session={session} onSelect={setSelectedForm} onLogout={handleLogout}/>;
      }
      if (selectedForm === "material_requisition") {
        return (
          <MRForm
            session={session}
            managerEmail={MANAGER_EMAIL}
            hodEmail={HOD_EMAIL}
            approvalSlab={APPROVAL_SLAB}
            formType={selectedForm}
            onLogout={handleLogout}
            onBack={() => setSelectedForm(null)}
          />
        );
      }
      return (
        <div style={s.loadPage}>
          <div style={s.errCard}>
            <GoltensLogo size="md" style={{ marginBottom:20, justifyContent:"center" }}/>
            <div style={{ fontSize:48, marginBottom:16 }}>🚧</div>
            <h2 style={{ color:G.navy }}>Coming Soon</h2>
            <p style={{ color:G.muted }}>This form is not yet available.</p>
            <button style={s.loginBtn} onClick={() => setSelectedForm(null)}>← Back to Forms</button>
          </div>
        </div>
      );
    }
  }

  // ── Not authenticated — Login page ────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={s.banner}>
        <GoltensLogo size="md" dark/>
        <span style={s.bannerTag}>Material Requisition Portal</span>
      </div>

      <div style={s.loginCard}>
        <GoltensLogo size="lg" style={{ marginBottom:28, justifyContent:"center" }}/>
        <h2 style={s.title}>Welcome to Goltens MR Portal</h2>
        <p style={s.sub}>
          Secure digital portal for Material Requisition management.<br/>
          Sign in with your Goltens corporate account.
        </p>

        <button style={s.loginBtn} onClick={() => auth.signinRedirect()}>
          <span style={{ fontSize:20, marginRight:12 }}>🔐</span>
          Sign In with Goltens Account
        </button>

        <div style={s.features}>
          {["Role-based access control","Real-time approval tracking","Email notifications","Secure document storage"].map(f => (
            <div key={f} style={s.feature}>✓ {f}</div>
          ))}
        </div>

        <div style={s.secureNote}>
          🔒 Secured by AWS Cognito · All data encrypted in transit and at rest
        </div>
      </div>

      <div style={s.footer}>
        © 2026 Goltens Co. Ltd. Dubai Branch — Powered by VCloudmaster FZE LLC
      </div>
    </div>
  );
}

const s = {
  page:       { minHeight:"100vh", background:`linear-gradient(135deg,${G.navy} 0%,${G.primary} 60%,${G.steel} 100%)`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Inter','Segoe UI',system-ui,Arial,sans-serif", padding:"20px 16px" },
  loadPage:   { minHeight:"100vh", background:`linear-gradient(135deg,${G.navy},${G.primary})`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Inter','Segoe UI',system-ui,Arial,sans-serif" },
  spinner:    { width:40, height:40, border:"3px solid rgba(255,255,255,0.3)", borderTop:"3px solid #fff", borderRadius:"50%", animation:"spin 1s linear infinite" },
  errCard:    { background:"#fff", borderRadius:12, padding:"40px 44px", textAlign:"center", maxWidth:420, width:"100%", boxShadow:"0 8px 32px rgba(0,0,0,0.2)" },
  banner:     { display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", maxWidth:500, marginBottom:24 },
  bannerTag:  { color:"rgba(255,255,255,0.75)", fontSize:13, fontStyle:"italic" },
  loginCard:  { background:"#fff", borderRadius:12, boxShadow:"0 8px 40px rgba(0,0,0,0.25)", padding:"40px 44px", width:"100%", maxWidth:500, textAlign:"center" },
  title:      { fontSize:22, fontWeight:700, color:G.navy, marginBottom:8 },
  sub:        { fontSize:13, color:G.muted, marginBottom:28, lineHeight:1.7 },
  loginBtn:   { width:"100%", background:`linear-gradient(135deg,${G.primary},${G.navy})`, color:"#fff", border:"none", borderRadius:8, padding:"14px", fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20 },
  features:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 16px", marginBottom:20, textAlign:"left" },
  feature:    { fontSize:12, color:G.muted, display:"flex", alignItems:"center", gap:6 },
  secureNote: { fontSize:11, color:G.muted },
  footer:     { marginTop:24, color:"rgba(255,255,255,0.5)", fontSize:11 },
};