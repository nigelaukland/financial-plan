import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setSubmitting(false);
  };

  return (
    <div className="fp-root fp-auth-wrap">
      <style>{`
        .fp-auth-card {
          max-width: 340px;
          margin: 18vh auto 0;
          background: var(--panel);
          border: 1px solid var(--rule);
          border-radius: 10px;
          padding: 28px 26px;
        }
        .fp-auth-title {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 22px;
          margin: 0 0 18px;
          color: var(--text);
        }
        .fp-auth-field { margin-bottom: 14px; display: flex; flex-direction: column; gap: 6px; }
        .fp-auth-field label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-dim);
        }
        .fp-auth-field input {
          background: var(--panel-2);
          border: 1px solid var(--rule);
          border-radius: 6px;
          padding: 9px 10px;
          color: var(--text);
          font-size: 14px;
        }
        .fp-auth-field input:focus { outline: 1px solid var(--brass); }
        .fp-auth-error { color: var(--bad); font-size: 13px; margin-bottom: 12px; }
        .fp-auth-submit {
          width: 100%;
          background: var(--brass);
          color: var(--ink);
          border: none;
          border-radius: 6px;
          padding: 10px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
        }
        .fp-auth-submit:disabled { opacity: 0.6; cursor: default; }
      `}</style>
      <form className="fp-auth-card" onSubmit={handleSubmit}>
        <p className="fp-auth-title">Sign in</p>
        <div className="fp-auth-field">
          <label htmlFor="fp-auth-email">Email</label>
          <input
            id="fp-auth-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="fp-auth-field">
          <label htmlFor="fp-auth-password">Password</label>
          <input
            id="fp-auth-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="fp-auth-error">{error}</p>}
        <button className="fp-auth-submit" type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export function SignOutButton() {
  return (
    <button
      onClick={() => supabase.auth.signOut()}
      style={{
        position: "fixed",
        top: 14,
        right: 18,
        zIndex: 50,
        background: "var(--panel-2)",
        color: "var(--text-dim)",
        border: "1px solid var(--rule)",
        borderRadius: 6,
        padding: "6px 12px",
        fontSize: 12,
        fontFamily: "'IBM Plex Mono', monospace",
        cursor: "pointer",
      }}
    >
      Sign out
    </button>
  );
}

export function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (session === null) return <LoginForm />;

  return (
    <>
      <SignOutButton />
      {children}
    </>
  );
}
