import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function AuthShell({ title, children }) {
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
        .fp-auth-notice { color: var(--good); font-size: 13px; margin-bottom: 12px; }
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
        .fp-auth-link {
          background: none;
          border: none;
          color: var(--text-dim);
          font-size: 12px;
          margin-top: 14px;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }
      `}</style>
      <div className="fp-auth-card">
        <p className="fp-auth-title">{title}</p>
        {children}
      </div>
    </div>
  );
}

function LoginForm({ onForgotPassword }) {
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
    <AuthShell title="Sign in">
      <form onSubmit={handleSubmit}>
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
      <button type="button" className="fp-auth-link" onClick={onForgotPassword}>
        Forgot password?
      </button>
    </AuthShell>
  );
}

function ForgotPasswordForm({ onBack }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) setError(error.message);
    else setSent(true);
    setSubmitting(false);
  };

  return (
    <AuthShell title="Reset password">
      {sent ? (
        <p className="fp-auth-notice">
          If that email has an account, a reset link is on its way — check your inbox.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="fp-auth-field">
            <label htmlFor="fp-auth-reset-email">Email</label>
            <input
              id="fp-auth-reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <p className="fp-auth-error">{error}</p>}
          <button className="fp-auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <button type="button" className="fp-auth-link" onClick={onBack}>
        Back to sign in
      </button>
    </AuthShell>
  );
}

function SetNewPasswordForm({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) setError(error.message);
    else onDone();
  };

  return (
    <AuthShell title="Set a new password">
      <form onSubmit={handleSubmit}>
        <div className="fp-auth-field">
          <label htmlFor="fp-auth-new-password">New password</label>
          <input
            id="fp-auth-new-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="fp-auth-field">
          <label htmlFor="fp-auth-confirm-password">Confirm password</label>
          <input
            id="fp-auth-confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <p className="fp-auth-error">{error}</p>}
        <button className="fp-auth-submit" type="submit" disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthShell>
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
  const [recovery, setRecovery] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;

  // Arriving via a password-reset email link: force setting a new password
  // before letting them into the app, even though Supabase already grants
  // a session for that link.
  if (recovery) return <SetNewPasswordForm onDone={() => setRecovery(false)} />;

  if (session === null) {
    return showForgot ? (
      <ForgotPasswordForm onBack={() => setShowForgot(false)} />
    ) : (
      <LoginForm onForgotPassword={() => setShowForgot(true)} />
    );
  }

  return (
    <>
      <SignOutButton />
      {children}
    </>
  );
}
