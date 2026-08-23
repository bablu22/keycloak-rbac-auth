import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api, setCsrfToken } from '../api/client';

type AuthContextValue = {
  initialized: boolean;
  authenticated: boolean;
  username: string;
  email: string;
  realmRoles: string[];
  permissions: string[];
  csrfToken: string;
  login: () => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRealmRole: (role: string) => boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState('User');
  const [email, setEmail] = useState('');
  const [realmRoles, setRealmRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [csrfToken, setCsrf] = useState('');

  const refreshProfile = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setAuthenticated(true);
      setUsername(
        String(data.preferred_username ?? data.email ?? data.name ?? 'User'),
      );
      setEmail(String(data.email ?? ''));
      setRealmRoles(data.realmRoles ?? []);
      setPermissions(data.clientRoles ?? []);
      if (data.csrfToken) {
        setCsrf(data.csrfToken);
        setCsrfToken(data.csrfToken);
      }
    } catch {
      setAuthenticated(false);
      setUsername('User');
      setEmail('');
      setRealmRoles([]);
      setPermissions([]);
      setCsrf('');
      setCsrfToken(null);
    }
  }, []);

  useEffect(() => {
    refreshProfile().finally(() => setInitialized(true));
  }, [refreshProfile]);

  const login = useCallback(() => {
    const returnTo = encodeURIComponent(`${window.location.origin}/app`);
    window.location.href = `${API_URL}/auth/login?returnTo=${returnTo}`;
  }, []);

  const logout = useCallback(async () => {
    try {
      const { data } = await api.post('/auth/logout');
      if (data.redirectTo) {
        window.location.href = data.redirectTo;
        return;
      }
    } catch {
      // fall through
    }
    window.location.href = '/';
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized,
      authenticated,
      username,
      email,
      realmRoles,
      permissions,
      csrfToken,
      login,
      logout,
      refreshProfile,
      hasRealmRole: (role) => realmRoles.includes(role),
      hasPermission: (permission) => permissions.includes(permission),
      hasAnyPermission: (needed) =>
        needed.some((permission) => permissions.includes(permission)),
    }),
    [
      authenticated,
      csrfToken,
      email,
      initialized,
      login,
      logout,
      permissions,
      realmRoles,
      refreshProfile,
      username,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
