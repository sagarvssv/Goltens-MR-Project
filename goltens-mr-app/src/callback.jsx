/**
 * Callback.jsx — Handles Cognito OAuth2 redirect
 * Wrapped inside AuthProvider so useAuth() works correctly
 */
import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import GoltensLogo from "./GoltensLogo";
import { G } from "./theme";

export default function Callback() {
  const auth = useAuth();

  useEffect(() => {
    // Once auth finishes processing the callback, redirect to home
    if (!auth.isLoading) {
      if (auth.isAuthenticated) {
        window.location.replace("/");
      } else if (auth.error) {
        // Error handled below in render
        console.error("Auth error:", auth.error);
      }
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.error]);

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(135deg,${G.navy},${G.primary})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter',system-ui,sans-serif"
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{
        background: "#fff", borderRadius: 12, padding: "48px 56px",
        textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
        maxWidth: 400, width: "100%"
      }}>
        <GoltensLogo size="md" style={{ marginBottom: 24, justifyContent: "center" }}/>
        {auth.error ? (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>❌</div>
            <div style={{ color: "#c0392b", fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
              Login failed: {auth.error.message}
            </div>
            <button style={{
              background: G.primary, color: "#fff", border: "none",
              borderRadius: 6, padding: "10px 24px", fontSize: 13, cursor: "pointer"
            }} onClick={() => window.location.href = "/"}>
              Back to Login
            </button>
          </>
        ) : (
          <>
            <div style={{
              width: 40, height: 40,
              border: "3px solid rgba(0,0,0,0.1)",
              borderTop: `3px solid ${G.primary}`,
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 20px"
            }}/>
            <div style={{ color: G.navy, fontSize: 15, fontWeight: 600 }}>
              Completing sign in…
            </div>
            <div style={{ color: G.muted, fontSize: 12, marginTop: 8 }}>Please wait</div>
          </>
        )}
      </div>
    </div>
  );
}