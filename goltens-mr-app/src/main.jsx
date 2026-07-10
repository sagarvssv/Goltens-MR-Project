import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import Callback from "./callback.jsx";
import { AuthProvider } from "react-oidc-context";

const cognitoAuthConfig = {
  authority:              "https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_RaNrAEiVl",
  client_id:              "m9e49rgvpfa8ghpen7i5k6qap",
  redirect_uri:           window.location.origin + "/callback",
  response_type:          "code",
  scope:                  "email openid phone",
  automaticSilentRenew:   true,
  loadUserInfo:           true,
  onSigninCallback:       () => {
    // After successful signin, redirect to home
    window.location.replace("/");
  },
};

const path = window.location.pathname;

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <AuthProvider {...cognitoAuthConfig}>
      {path === "/callback" ? <Callback /> : <App />}
    </AuthProvider>
  </React.StrictMode>
);