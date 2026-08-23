import { Navigate, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAuth } from './AuthProvider';

export function RequireAuth() {
  const { initialized, authenticated, login } = useAuth();

  if (!initialized) {
    return (
      <div className="boot-screen">
        <p>Connecting to identity…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="boot-screen">
        <p>Sign in required to open the workspace.</p>
        <button type="button" className="btn btn-primary" onClick={login}>
          Sign in
        </button>
      </div>
    );
  }

  return <Outlet />;
}

export function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: string[];
  children: ReactNode;
}) {
  const { hasAnyPermission } = useAuth();

  if (!hasAnyPermission(anyOf)) {
    return <Navigate to="/app" replace />;
  }

  return children;
}
