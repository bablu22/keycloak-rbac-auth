import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';

const nav = [
  { to: '/app', label: 'Overview', end: true },
  { to: '/app/invoices', label: 'Invoices', permission: 'invoice_read' },
  { to: '/app/payroll', label: 'Payroll', permission: 'payroll_view' },
  { to: '/app/inventory', label: 'Inventory', permission: 'inventory_view' },
  { to: '/app/users', label: 'People', permission: 'user_read' },
  {
    to: '/app/reports',
    label: 'Reports',
    anyOf: ['report_finance', 'report_sales'],
  },
  { to: '/app/profile', label: 'Profile' },
];

export function AppShell() {
  const {
    username,
    realmRoles,
    permissions,
    logout,
    hasPermission,
    hasAnyPermission,
  } = useAuth();

  const visible = nav.filter((item) => {
    if (item.permission) return hasPermission(item.permission);
    if (item.anyOf) return hasAnyPermission(item.anyOf);
    return true;
  });

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand-block">
          <p className="brand-mark">LedgerOS</p>
          <p className="brand-sub">Operations console</p>
        </div>

        <nav className="rail-nav">
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? 'rail-link active' : 'rail-link'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="role-strip">
          <p className="strip-label">Realm roles</p>
          <div className="chips">
            {realmRoles
              .filter(
                (role) =>
                  !role.startsWith('default-roles') &&
                  role !== 'offline_access' &&
                  role !== 'uma_authorization',
              )
              .map((role) => (
                <span key={role} className="chip">
                  {role}
                </span>
              ))}
          </div>
          <p className="strip-label">Permissions</p>
          <div className="chips">
            {permissions.map((permission) => (
              <span key={permission} className="chip chip-perm">
                {permission}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <p className="topbar-kicker">Signed in (BFF session)</p>
            <p className="topbar-user">{username}</p>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
