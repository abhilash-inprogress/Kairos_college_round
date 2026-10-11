import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthGate from "./AuthGate.jsx";
import PublicEventPage from "./PublicEventPage.jsx";
import "./styles.css";

const publicEventMatch = window.location.pathname.match(/^\/events\/([a-z0-9-]{1,100})\/?$/i);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {publicEventMatch
      ? <PublicEventPage slug={publicEventMatch[1]} />
      : <AuthGate>
          {(user, signOut) => <App user={user} onSignOut={signOut} />}
        </AuthGate>}
  </React.StrictMode>,
);
