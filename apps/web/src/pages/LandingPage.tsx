import { useAuth } from '../auth/AuthProvider';

export function LandingPage() {
  const { initialized, authenticated, login } = useAuth();
  const authError = new URLSearchParams(window.location.search).get('authError');

  if (!initialized) {
    return (
      <div className="landing">
        <div className="landing-panel">
          <p className="brand-mark">LedgerOS</p>
          <p>Starting identity session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden />
      <div className="landing-grid" aria-hidden />
      <div className="landing-panel">
        <p className="brand-mark">LedgerOS</p>
        <h1>Identity-backed ERP lab</h1>
        <p className="landing-copy">
          Accounts are provisioned by admins from People — not self-registration.
          Sign in with a company account assigned roles and permissions in
          Keycloak.
        </p>
        {authError ? (
          <p className="error-banner">
            Sign-in failed. Please try again or contact your administrator.
          </p>
        ) : null}
        <div className="landing-actions">
          {authenticated ? (
            <a className="btn btn-primary" href="/app">
              Open workspace
            </a>
          ) : (
            <button type="button" className="btn btn-primary" onClick={login}>
              Sign in
            </button>
          )}
        </div>
        {import.meta.env.DEV ? (
          <dl className="landing-meta">
            <div>
              <dt>Demo users</dt>
              <dd>admin / alice / bob / carol / dave / erin @erp.local</dd>
            </div>
            <div>
              <dt>Password</dt>
              <dd>password</dd>
            </div>
          </dl>
        ) : null}
      </div>
    </div>
  );
}
