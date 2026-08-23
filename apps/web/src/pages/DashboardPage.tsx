import { useEffect, useState } from 'react';

import { createApiClient } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

export function DashboardPage() {
  const { username, realmRoles, permissions } = useAuth();
  const [message, setMessage] = useState('Loading dashboard…');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const api = createApiClient();
    api
      .get('/dashboard')
      .then((res) => {
        if (!cancelled) setMessage(res.data.message);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.message ?? err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <h1>Overview</h1>
        <p>
          Hello {username}. APIs use your httpOnly session cookie (BFF). Mobile
          apps will send Bearer JWTs instead.
        </p>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <div className="stat-row">
        <article className="stat">
          <p className="stat-label">API status</p>
          <p className="stat-value">{message}</p>
        </article>
        <article className="stat">
          <p className="stat-label">Realm roles</p>
          <p className="stat-value">{realmRoles.length}</p>
        </article>
        <article className="stat">
          <p className="stat-label">Permissions</p>
          <p className="stat-value">{permissions.length}</p>
        </article>
      </div>
    </section>
  );
}
