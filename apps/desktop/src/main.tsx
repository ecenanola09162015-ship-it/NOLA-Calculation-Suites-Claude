import React from "react";
import ReactDOM from "react-dom/client";

import "./styles.css";

function DesktopLogin() {
  return (
    <main className="desktopShell">
      <section className="brandPanel">
        <div className="mark">Ñ</div>
        <p>ÑOLA CALCULATION SUITES</p>
        <h1>Engineering calculations, synchronized and traceable.</h1>
        <span>Windows desktop preview · Version 0.1</span>
      </section>
      <section className="loginPanel">
        <p className="eyebrow">SECURE ACCOUNT ACCESS</p>
        <h2>Log in to continue</h2>
        <p>
          Your account protects synchronized projects and calculation history.
        </p>
        <label>
          Email address
          <input type="email" placeholder="engineer@example.com" />
        </label>
        <label>
          Password
          <input type="password" placeholder="••••••••••••" />
        </label>
        <button disabled>Log in</button>
        <small>
          Managed identity integration is enabled in milestone 0.2. This preview
          fails closed.
        </small>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DesktopLogin />
  </React.StrictMode>,
);
