/**
 * auth.js — Cognito auth helpers using react-oidc-context
 * The useAuth() hook from react-oidc-context handles all token management.
 * This file provides helper functions used across the app.
 */

const COGNITO_DOMAIN = "eu-central-1ranraeivl.auth.eu-central-1.amazoncognito.com";
const CLIENT_ID      = "m9e49rgvpfa8ghpen7i5k6qap";

/**
 * Logout — redirect to Cognito logout endpoint
 */
export function cognitoLogout(logoutUri = window.location.origin) {
  const params = new URLSearchParams({
    client_id:  CLIENT_ID,
    logout_uri: logoutUri,
  });
  window.location.href = `https://${COGNITO_DOMAIN}/logout?${params}`;
}

/**
 * Extract Goltens session from Cognito user profile
 * Maps Cognito claims to the session object used across all portals
 */
export function extractSession(oidcUser) {
  if (!oidcUser) return null;

  const profile = oidcUser.profile || {};

  // Decode id_token to get ALL claims including custom attributes
  let claims = {};
  try {
    if (oidcUser.id_token) {
      const payload = oidcUser.id_token.split(".")[1];
      const padded  = payload + "=".repeat((4 - payload.length % 4) % 4);
      claims = JSON.parse(atob(padded));
    }
  } catch(e) {
    console.warn("Could not decode id_token:", e);
  }

  // Debug — log all claims to console so we can see what Cognito sends
  console.log("Cognito ID token claims:", JSON.stringify(claims, null, 2));
  console.log("OIDC profile:", JSON.stringify(profile, null, 2));

  const role = claims["custom:role"] || profile["custom:role"] || "";
  const email = claims.email || profile.email || "";
  const name  = claims.name  || profile.name  || email;

  return {
    email,
    name,
    role,
    id_no:      claims["custom:id_no"]      || profile["custom:id_no"]      || "",
    department: claims["custom:department"] || profile["custom:department"] || "",
    idToken:    oidcUser.id_token || "",
  };
}

/**
 * Get the ID token for API calls
 */
export function getIdToken(oidcUser) {
  return oidcUser?.id_token || "";
}