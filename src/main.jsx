import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthGate from "./AuthGate.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate>
      {(user, signOut) => <App user={user} onSignOut={signOut} />}
    </AuthGate>
  </React.StrictMode>,
);
