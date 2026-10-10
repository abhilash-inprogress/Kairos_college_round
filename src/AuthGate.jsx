import React, { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabase.js";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      else setSession(data.session);
      setLoading(false);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!supabase) {
      setError("Authentication is not configured yet. Add the Supabase settings shown below and restart the app.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (authError) throw authError;
        if (data.session) {
          setSession(data.session);
        } else {
          setNotice("Account created. Check your email to confirm your address, then sign in.");
          setMode("signin");
          setPassword("");
        }
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
        setSession(data.session);
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const { error: authError } = await supabase.auth.signOut();
    if (authError) throw authError;
    setSession(null);
  }

  if (loading) {
    return <main className="auth-shell"><div className="auth-loading"><span className="auth-spinner" />Checking your session…</div></main>;
  }

  if (session) return children(session.user, signOut);

  const signup = mode === "signup";
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-mark">N</span><span><b>NEXUS</b><small>AI BUSINESS PLATFORM</small></span></div>
        <span className="eyebrow">{signup ? "CREATE YOUR ACCOUNT" : "WELCOME BACK"}</span>
        <h1>{signup ? "Start building with NEXUS" : "Sign in to your workspace"}</h1>
        <p className="auth-copy">{signup ? "Create an account to access your connected business workspace." : "Enter your details to continue to your NEXUS workspace."}</p>
        {!isSupabaseConfigured && <div className="notice auth-config-notice">To enable real authentication, add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to a local <code>.env</code> file, then restart the app. See <code>.env.example</code>.</div>}
        {error && <div className="notice error" role="alert">{error}</div>}
        {notice && <div className="notice auth-notice" role="status">{notice}</div>}
        <form onSubmit={submit}>
          {signup && <label>Full name<input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label>}
          <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></label>
          <label>Password<input type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={signup ? "At least 8 characters" : "Enter your password"} /></label>
          <button className="btn auth-submit" disabled={busy || !isSupabaseConfigured}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}<span aria-hidden="true">↗</span></button>
        </form>
        <div className="auth-switch">{signup ? "Already have an account?" : "New to NEXUS?"}<button onClick={() => { setMode(signup ? "signin" : "signup"); setError(""); setNotice(""); }}> {signup ? "Sign in" : "Create account"}</button></div>
        <p className="auth-footnote">Secure authentication powered by Supabase.</p>
      </section>
      <aside className="auth-aside"><span className="auth-orbit orbit-one" /><span className="auth-orbit orbit-two" /><div className="auth-aside-content"><span className="eyebrow">ONE CONNECTED WORKSPACE</span><h2>Run your business<br />in a smarter rhythm.</h2><p>Events, customers, campaigns, and operations—designed to work together.</p><div className="auth-aside-tags"><span>Events</span><span>CRM</span><span>Marketing</span><span>Automation</span></div></div><span className="auth-aside-footer">NEXUS · AI Business Operating Platform</span></aside>
    </main>
  );
}
