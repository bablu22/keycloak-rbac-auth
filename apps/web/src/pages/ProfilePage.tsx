import { useAuth } from '../auth/AuthProvider';

export function ProfilePage() {
  const { username, email, realmRoles, permissions } = useAuth();

  return (
    <section className="page">
      <header className="page-header">
        <h1>Profile</h1>
        <p>
          Claims come from the server session (httpOnly cookie). The browser
          never receives access or refresh tokens.
        </p>
      </header>

      <div className="stat-row">
        <article className="stat">
          <p className="stat-label">Username</p>
          <p className="stat-value text-sm">{username}</p>
        </article>
        <article className="stat">
          <p className="stat-label">Email</p>
          <p className="stat-value text-sm">{email || '—'}</p>
        </article>
      </div>

      <h2 className="section-title">Realm roles</h2>
      <div className="chips">
        {realmRoles.map((role) => (
          <span key={role} className="chip">
            {role}
          </span>
        ))}
      </div>

      <h2 className="section-title">nest-api permissions</h2>
      <div className="chips">
        {permissions.map((permission) => (
          <span key={permission} className="chip chip-perm">
            {permission}
          </span>
        ))}
      </div>
    </section>
  );
}
