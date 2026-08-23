import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { createApiClient } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { RequirePermission } from '../auth/RequireAuth';

type ErpUser = {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  emailVerified: boolean;
  groups: string[];
  realmRoles: string[];
  permissions: string[];
};

type CatalogGroup = {
  id: string;
  name: string;
  path: string;
  realmRoles: string[];
  permissions: string[];
};

type CatalogRole = {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
};

type CatalogPermission = {
  id: string;
  name: string;
  description?: string;
};

type Catalog = {
  groups: CatalogGroup[];
  realmRoles: CatalogRole[];
  permissions: CatalogPermission[];
  storageNote?: string;
};

type Tab = 'users' | 'groups' | 'roles' | 'permissions';

function toggleValue(list: string[], value: string) {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

function errMessage(err: unknown) {
  const message =
    (err as { response?: { data?: { message?: string | string[] } } }).response
      ?.data?.message ?? (err as Error).message;
  return Array.isArray(message) ? message.join(', ') : String(message);
}

export function UsersPage() {
  return (
    <RequirePermission anyOf={['user_read']}>
      <UsersInner />
    </RequirePermission>
  );
}

function UsersInner() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('user_manage');
  const [tab, setTab] = useState<Tab>(canManage ? 'roles' : 'users');
  const [users, setUsers] = useState<ErpUser[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  // Users
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('ChangeMe1!');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Groups
  const [groupName, setGroupName] = useState('');
  const [groupRealmRoles, setGroupRealmRoles] = useState<string[]>(['employee']);
  const [groupPermissions, setGroupPermissions] = useState<string[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // Roles
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [editingRoleName, setEditingRoleName] = useState<string | null>(null);

  // Permissions
  const [permissionName, setPermissionName] = useState('');
  const [permissionDescription, setPermissionDescription] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    const api = createApiClient();
    setError('');
    try {
      const usersPromise = api.get<ErpUser[]>('/users', { signal });
      const catalogPromise = canManage
        ? api.get<Catalog>('/users/catalog', { signal })
        : Promise.resolve(null);
      const [usersRes, catalogRes] = await Promise.all([
        usersPromise,
        catalogPromise,
      ]);
      setUsers(usersRes.data);
      if (catalogRes) setCatalog(catalogRes.data);
    } catch (err) {
      if (signal?.aborted) return;
      setError(errMessage(err));
    }
  }, [canManage]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const flash = (message: string) => {
    setOk(message);
    setError('');
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resetUserForm = () => {
    setEmail('');
    setFirstName('');
    setLastName('');
    setTemporaryPassword('ChangeMe1!');
    setGroupIds([]);
    setEditingUserId(null);
  };

  const resetGroupForm = () => {
    setGroupName('');
    setGroupRealmRoles(['employee']);
    setGroupPermissions([]);
    setEditingGroupId(null);
  };

  const resetRoleForm = () => {
    setRoleName('');
    setRoleDescription('');
    setRolePermissions([]);
    setEditingRoleName(null);
  };

  const startEditUser = async (user: ErpUser) => {
    setEditingUserId(user.id);
    setEmail(user.email ?? user.username);
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setTab('users');
    try {
      const api = createApiClient();
      const { data } = await api.get<string[]>(`/users/${user.id}/group-ids`);
      setGroupIds(data);
    } catch {
      setGroupIds([]);
    }
  };

  const startEditGroup = (group: CatalogGroup) => {
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setGroupRealmRoles(group.realmRoles);
    setGroupPermissions(group.permissions);
    setTab('groups');
  };

  const startEditRole = (role: CatalogRole) => {
    setEditingRoleName(role.name);
    setRoleName(role.name);
    setRoleDescription(role.description ?? '');
    setRolePermissions(role.permissions ?? []);
    setTab('roles');
  };

  const onSaveUser = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const api = createApiClient();
      if (editingUserId) {
        await api.patch(`/users/${editingUserId}`, { groupIds });
        flash(`Updated groups for ${email}`);
      } else {
        await api.post('/users', {
          email,
          firstName,
          lastName,
          temporaryPassword,
          groupIds,
        });
        flash(`Created ${email}. They must change password on first login.`);
      }
      resetUserForm();
    });
  };

  const onSaveGroup = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const api = createApiClient();
      if (editingGroupId) {
        await api.patch(`/users/groups/${editingGroupId}`, {
          realmRoles: groupRealmRoles,
          permissions: groupPermissions,
        });
        flash(`Updated group ${groupName}`);
      } else {
        await api.post('/users/groups', {
          name: groupName,
          realmRoles: groupRealmRoles,
          permissions: groupPermissions,
        });
        flash(`Created group ${groupName}`);
      }
      resetGroupForm();
    });
  };

  const onSaveRole = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const api = createApiClient();
      if (editingRoleName) {
        await api.patch(`/users/roles/${encodeURIComponent(editingRoleName)}`, {
          description: roleDescription,
          permissions: rolePermissions,
        });
        flash(`Updated role ${editingRoleName}`);
      } else {
        await api.post('/users/roles', {
          name: roleName,
          description: roleDescription,
          permissions: rolePermissions,
        });
        flash(`Created role ${roleName}`);
      }
      resetRoleForm();
    });
  };

  const onCreatePermission = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const api = createApiClient();
      await api.post('/users/permissions', {
        name: permissionName,
        description: permissionDescription,
      });
      flash(`Created permission ${permissionName}`);
      setPermissionName('');
      setPermissionDescription('');
    });
  };

  const tabs: Array<{ id: Tab; label: string; manageOnly?: boolean }> = [
    { id: 'roles', label: 'Roles', manageOnly: true },
    { id: 'permissions', label: 'Permissions', manageOnly: true },
    { id: 'groups', label: 'Groups', manageOnly: true },
    { id: 'users', label: 'Users' },
  ];

  return (
    <section className="page">
      <header className="page-header">
        <h1>People & access</h1>
        <p>
          Full admin control: create permissions, build roles with permissions,
          compose groups from existing roles/permissions, then assign groups to
          users.
        </p>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}
      {ok ? <p className="ok-banner">{ok}</p> : null}

      <div className="admin-tabs" role="tablist">
        {tabs
          .filter((t) => !t.manageOnly || canManage)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={tab === t.id ? 'admin-tab active' : 'admin-tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
      </div>

      {canManage && catalog && tab === 'permissions' ? (
        <div className="admin-panel">
          <form className="people-form" onSubmit={onCreatePermission}>
            <h2>Create permission</h2>
            <p className="muted">
              Permissions are nest-api client roles used by API guards (e.g.
              invoice_approve).
            </p>
            <div className="people-grid">
              <label>
                Name
                <input
                  required
                  value={permissionName}
                  onChange={(e) => setPermissionName(e.target.value)}
                  placeholder="audit_export"
                />
              </label>
              <label>
                Description
                <input
                  value={permissionDescription}
                  onChange={(e) => setPermissionDescription(e.target.value)}
                  placeholder="Export audit reports"
                />
              </label>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Create permission'}
            </button>
          </form>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Permission</th>
                  <th>Description</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {catalog.permissions.map((perm) => (
                  <tr key={perm.id}>
                    <td>
                      <code>{perm.name}</code>
                    </td>
                    <td>{perm.description || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const api = createApiClient();
                            await api.delete(
                              `/users/permissions/${encodeURIComponent(perm.name)}`,
                            );
                            flash(`Deleted permission ${perm.name}`);
                          })
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {canManage && catalog && tab === 'roles' ? (
        <div className="admin-panel">
          <form className="people-form" onSubmit={onSaveRole}>
            <h2>{editingRoleName ? 'Edit role' : 'Create role'}</h2>
            <p className="muted">
              Realm roles can include permissions (composite). Users who get this
              role inherit those permissions in their token.
            </p>
            <div className="people-grid">
              <label>
                Role name
                <input
                  required
                  value={roleName}
                  disabled={Boolean(editingRoleName)}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="auditor"
                />
              </label>
              <label>
                Description
                <input
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  placeholder="Read-only auditor"
                />
              </label>
            </div>

            <fieldset className="group-picker">
              <legend>Permissions on this role</legend>
              <div className="chip-list">
                {catalog.permissions.map((perm) => (
                  <label key={perm.id} className="chip">
                    <input
                      type="checkbox"
                      checked={rolePermissions.includes(perm.name)}
                      onChange={() =>
                        setRolePermissions((prev) =>
                          toggleValue(prev, perm.name),
                        )
                      }
                    />
                    {perm.name}
                  </label>
                ))}
              </div>
              {!catalog.permissions.length ? (
                <p className="muted">Create permissions first.</p>
              ) : null}
            </fieldset>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy
                  ? 'Saving…'
                  : editingRoleName
                    ? 'Update role'
                    : 'Create role'}
              </button>
              {editingRoleName ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetRoleForm}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Permissions</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {catalog.realmRoles.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <strong>{role.name}</strong>
                      <div className="muted">{role.description || '—'}</div>
                    </td>
                    <td>
                      <code className="perm-list">
                        {role.permissions?.join(', ') || '—'}
                      </code>
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => startEditRole(role)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const api = createApiClient();
                            await api.delete(
                              `/users/roles/${encodeURIComponent(role.name)}`,
                            );
                            flash(`Deleted role ${role.name}`);
                          })
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {canManage && catalog && tab === 'groups' ? (
        <div className="admin-panel">
          <form className="people-form" onSubmit={onSaveGroup}>
            <h2>{editingGroupId ? 'Edit group' : 'Create group'}</h2>
            <p className="muted">
              Groups bundle existing realm roles and permissions. Assign groups
              to users.
            </p>
            <label>
              Group name
              <input
                required
                value={groupName}
                disabled={Boolean(editingGroupId)}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Auditors"
              />
            </label>

            <fieldset className="group-picker">
              <legend>Existing realm roles</legend>
              <div className="chip-list">
                {catalog.realmRoles.map((role) => (
                  <label key={role.id} className="chip">
                    <input
                      type="checkbox"
                      checked={groupRealmRoles.includes(role.name)}
                      onChange={() =>
                        setGroupRealmRoles((prev) =>
                          toggleValue(prev, role.name),
                        )
                      }
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="group-picker">
              <legend>Existing permissions</legend>
              <div className="chip-list">
                {catalog.permissions.map((perm) => (
                  <label key={perm.id} className="chip">
                    <input
                      type="checkbox"
                      checked={groupPermissions.includes(perm.name)}
                      onChange={() =>
                        setGroupPermissions((prev) =>
                          toggleValue(prev, perm.name),
                        )
                      }
                    />
                    {perm.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy
                  ? 'Saving…'
                  : editingGroupId
                    ? 'Update group'
                    : 'Create group'}
              </button>
              {editingGroupId ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetGroupForm}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Roles</th>
                  <th>Permissions</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {catalog.groups.map((group) => (
                  <tr key={group.id}>
                    <td>
                      <strong>{group.name}</strong>
                      <div className="muted">{group.path}</div>
                    </td>
                    <td>{group.realmRoles.join(', ') || '—'}</td>
                    <td>
                      <code className="perm-list">
                        {group.permissions.join(', ') || '—'}
                      </code>
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => startEditGroup(group)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const api = createApiClient();
                            await api.delete(`/users/groups/${group.id}`);
                            flash(`Deleted group ${group.name}`);
                          })
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'users' ? (
        <div className="admin-panel">
          {canManage && catalog ? (
            <form className="people-form" onSubmit={onSaveUser}>
              <h2>{editingUserId ? 'Edit user groups' : 'Create user'}</h2>
              <p className="muted">
                Users inherit roles and permissions from assigned groups.
              </p>
              {!editingUserId ? (
                <div className="people-grid">
                  <label>
                    Email
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="newhire@erp.local"
                    />
                  </label>
                  <label>
                    First name
                    <input
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </label>
                  <label>
                    Last name
                    <input
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </label>
                  <label>
                    Temporary password
                    <input
                      required
                      type="text"
                      value={temporaryPassword}
                      onChange={(e) => setTemporaryPassword(e.target.value)}
                    />
                  </label>
                </div>
              ) : (
                <p>
                  Editing groups for <strong>{email}</strong>
                </p>
              )}

              <fieldset className="group-picker">
                <legend>Groups</legend>
                <div className="group-list">
                  {catalog.groups.map((group) => (
                    <label key={group.id} className="group-card">
                      <input
                        type="checkbox"
                        checked={groupIds.includes(group.id)}
                        onChange={() =>
                          setGroupIds((prev) => toggleValue(prev, group.id))
                        }
                      />
                      <span>
                        <strong>{group.name}</strong>
                        <small>
                          roles: {group.realmRoles.join(', ') || '—'} · perms:{' '}
                          {group.permissions.join(', ') || '—'}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || (!editingUserId && groupIds.length === 0)}
                >
                  {busy
                    ? 'Saving…'
                    : editingUserId
                      ? 'Update groups'
                      : 'Create user'}
                </button>
                {editingUserId ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={resetUserForm}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Groups</th>
                  <th>Roles</th>
                  <th>Permissions</th>
                  <th>Status</th>
                  {canManage ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>
                        {user.firstName} {user.lastName}
                      </strong>
                      <div className="muted">{user.email ?? user.username}</div>
                    </td>
                    <td>{user.groups.join(', ') || '—'}</td>
                    <td>{user.realmRoles.join(', ') || '—'}</td>
                    <td>
                      <code className="perm-list">
                        {user.permissions.join(', ') || '—'}
                      </code>
                    </td>
                    <td>{user.enabled ? 'Active' : 'Disabled'}</td>
                    {canManage ? (
                      <td className="row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() => void startEditUser(user)}
                        >
                          Groups
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const api = createApiClient();
                              await api.patch(`/users/${user.id}`, {
                                enabled: !user.enabled,
                              });
                              flash(
                                `${user.enabled ? 'Disabled' : 'Enabled'} ${user.email ?? user.username}`,
                              );
                            })
                          }
                        >
                          {user.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const api = createApiClient();
                              await api.delete(`/users/${user.id}`);
                              flash(
                                `Deleted ${user.email ?? user.username}`,
                              );
                            })
                          }
                        >
                          Delete
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {catalog?.storageNote ? (
        <p className="muted storage-note">{catalog.storageNote}</p>
      ) : null}
    </section>
  );
}
