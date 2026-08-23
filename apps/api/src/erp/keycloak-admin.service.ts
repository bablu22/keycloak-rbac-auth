import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

export type KeycloakUserSummary = {
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

export type CreateUserInput = {
  email: string;
  firstName: string;
  lastName: string;
  temporaryPassword: string;
  groupIds: string[];
  enabled?: boolean;
};

export type UpdateUserInput = {
  enabled?: boolean;
  groupIds?: string[];
};

export type CreateGroupInput = {
  name: string;
  /** Existing or new realm role names to attach */
  realmRoles: string[];
  /** Existing or new nest-api permission (client role) names */
  permissions: string[];
};

export type UpdateGroupInput = {
  realmRoles?: string[];
  permissions?: string[];
};

export type CreateRoleInput = {
  name: string;
  description?: string;
  /** nest-api permissions composed into this realm role */
  permissions?: string[];
};

export type UpdateRoleInput = {
  description?: string;
  permissions?: string[];
};

export type CreatePermissionInput = {
  name: string;
  description?: string;
};

type RoleRef = { id: string; name: string; description?: string };

const CATALOG_TTL_MS = 30_000;
const LIST_CONCURRENCY = 8;

type CatalogData = {
  groups: Array<{
    id: string;
    name: string;
    path: string;
    realmRoles: string[];
    permissions: string[];
  }>;
  realmRoles: Array<{
    id: string;
    name: string;
    description?: string;
    permissions: string[];
  }>;
  permissions: Array<{ id: string; name: string; description?: string }>;
  storageNote: string;
};

@Injectable()
export class KeycloakAdminService implements OnModuleInit {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private token: TokenCache | null = null;
  private clientUuidCache: { id: string; expiresAt: number } | null = null;
  private catalogCache: { data: CatalogData; expiresAt: number } | null = null;

  private readonly keycloakUrl =
    process.env.KEYCLOAK_URL ?? 'http://localhost:8080';
  private readonly realm = process.env.KEYCLOAK_REALM ?? 'erp-realm';
  private readonly adminClientId =
    process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? 'ledgeros-admin';
  private readonly adminClientSecret =
    process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ?? '';
  private readonly apiClientId = process.env.KEYCLOAK_CLIENT_ID ?? 'nest-api';

  private get adminBase() {
    return `${this.keycloakUrl}/admin/realms/${this.realm}`;
  }

  async onModuleInit() {
    try {
      await this.disableSelfRegistration();
      this.logger.log('Self-registration disabled in Keycloak realm');
    } catch (error) {
      this.logger.warn(
        `Could not disable registration: ${(error as Error).message}`,
      );
    }
  }

  private async getAdminToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 15_000) {
      return this.token.accessToken;
    }

    if (!this.adminClientSecret) {
      throw new ServiceUnavailableException(
        'KEYCLOAK_ADMIN_CLIENT_SECRET not set — run: node scripts/sync-keycloak-secrets.mjs && node scripts/setup-ledgeros-admin.mjs',
      );
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.adminClientId,
      client_secret: this.adminClientSecret,
    });

    const res = await fetch(
      `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );
    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      const hint =
        json.error_description?.includes('Invalid client') ||
        json.error_description?.includes('credentials')
          ? ' Run: node scripts/setup-ledgeros-admin.mjs && node scripts/sync-keycloak-secrets.mjs then restart the API.'
          : '';
      throw new ServiceUnavailableException(
        (json.error_description || 'Keycloak admin login failed') + hint,
      );
    }

    this.token = {
      accessToken: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 60) * 1000,
    };
    return this.token.accessToken;
  }

  private async adminFetch(path: string, init: RequestInit = {}) {
    const token = await this.getAdminToken();
    const res = await fetch(`${this.adminBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    return res;
  }

  private invalidateCatalog() {
    this.catalogCache = null;
  }

  private adminError(action: string, res: Response) {
    this.logger.warn(`${action} failed (${res.status})`);
    throw new BadRequestException(`Keycloak admin request failed: ${action}`);
  }

  private async mapPool<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    concurrency = LIST_CONCURRENCY,
  ): Promise<R[]> {
    const results: R[] = [];
    let index = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (index < items.length) {
          const i = index++;
          results[i] = await fn(items[i]!);
        }
      },
    );
    await Promise.all(workers);
    return results;
  }

  private async disableSelfRegistration() {
    const res = await this.adminFetch('');
    if (!res.ok) {
      throw new Error(`Failed to load realm: ${res.status}`);
    }
    const realm = (await res.json()) as Record<string, unknown>;
    if (realm.registrationAllowed === false) return;

    const put = await this.adminFetch('', {
      method: 'PUT',
      body: JSON.stringify({ ...realm, registrationAllowed: false }),
    });
    if (!put.ok) {
      throw new Error(`Failed to update realm: ${put.status}`);
    }
  }

  async getCatalog() {
    if (this.catalogCache && this.catalogCache.expiresAt > Date.now()) {
      return this.catalogCache.data;
    }

    const clientUuid = await this.getNestApiClientUuid();
    const [groupsRes, realmRolesRes, permissionsRes] = await Promise.all([
      this.adminFetch('/groups?briefRepresentation=true'),
      this.adminFetch('/roles'),
      this.adminFetch(`/clients/${clientUuid}/roles`),
    ]);

    if (!groupsRes.ok || !realmRolesRes.ok || !permissionsRes.ok) {
      throw new ServiceUnavailableException('Failed to load Keycloak catalog');
    }

    const groupsRaw = (await groupsRes.json()) as Array<{
      id: string;
      name: string;
      path: string;
    }>;
    const realmRoles = (await realmRolesRes.json()) as Array<{
      id: string;
      name: string;
      description?: string;
    }>;
    const permissions = permissionsRes.ok
      ? ((await permissionsRes.json()) as Array<{
          id: string;
          name: string;
          description?: string;
        }>)
      : [];

    const groups = await this.mapPool(groupsRaw, async (g) => {
      const mapRes = await this.adminFetch(`/groups/${g.id}/role-mappings`);
      let realmRoleNames: string[] = [];
      let permissionNames: string[] = [];
      if (mapRes.ok) {
        const maps = (await mapRes.json()) as {
          realmMappings?: Array<{ name: string }>;
          clientMappings?: Record<
            string,
            { mappings?: Array<{ name: string }> }
          >;
        };
        realmRoleNames = (maps.realmMappings ?? []).map((r) => r.name);
        permissionNames =
          maps.clientMappings?.[this.apiClientId]?.mappings?.map(
            (r) => r.name,
          ) ?? [];
      }
      return {
        id: g.id,
        name: g.name,
        path: g.path,
        realmRoles: realmRoleNames,
        permissions: permissionNames,
      };
    });

    const realmRoleDetails = await this.mapPool(
      realmRoles.filter((r) => !r.name.startsWith('default-roles-')),
      async (r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: await this.getRealmRoleCompositePermissions(
          r.id,
          clientUuid,
        ),
      }),
    );

    const data = {
      groups,
      realmRoles: realmRoleDetails,
      permissions: permissions.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
      })),
      storageNote:
        'Users, roles, groups, permissions → Keycloak (Postgres). Invoices, inventory, payroll, audit log → ledgeros DB (Postgres). Sessions → Redis.',
    };

    this.catalogCache = { data, expiresAt: Date.now() + CATALOG_TTL_MS };
    return data;
  }

  async listUsers(): Promise<KeycloakUserSummary[]> {
    const res = await this.adminFetch('/users?max=200');
    if (!res.ok) {
      throw new ServiceUnavailableException('Failed to list Keycloak users');
    }
    const users = (await res.json()) as Array<{
      id: string;
      username: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      enabled?: boolean;
      emailVerified?: boolean;
    }>;

    const clientUuid = await this.getNestApiClientUuid();
    return this.mapPool(users, (user) =>
      this.getUserSummary(user, clientUuid),
    );
  }

  private async getUserSummary(
    user: {
      id: string;
      username: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      enabled?: boolean;
      emailVerified?: boolean;
    },
    clientUuid?: string,
  ): Promise<KeycloakUserSummary> {
    const uuid = clientUuid ?? (await this.getNestApiClientUuid());
    const [groups, realmRoles, permissions] = await Promise.all([
      this.getUserGroups(user.id),
      this.getEffectiveRealmRoles(user.id),
      this.getEffectiveClientRoles(user.id, uuid),
    ]);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      enabled: user.enabled ?? false,
      emailVerified: user.emailVerified ?? false,
      groups,
      realmRoles,
      permissions,
    };
  }

  private async getUserGroups(userId: string): Promise<string[]> {
    const res = await this.adminFetch(`/users/${userId}/groups`);
    if (!res.ok) return [];
    const groups = (await res.json()) as Array<{ path?: string; name: string }>;
    return groups.map((g) => g.path ?? g.name);
  }

  private async getEffectiveRealmRoles(userId: string): Promise<string[]> {
    const res = await this.adminFetch(
      `/users/${userId}/role-mappings/realm/composite`,
    );
    if (!res.ok) return [];
    const roles = (await res.json()) as Array<{ name: string }>;
    return roles
      .map((r) => r.name)
      .filter(
        (name) =>
          !name.startsWith('default-roles-') &&
          name !== 'offline_access' &&
          name !== 'uma_authorization',
      );
  }

  private async getEffectiveClientRoles(
    userId: string,
    clientUuid?: string,
  ): Promise<string[]> {
    const uuid = clientUuid ?? (await this.getNestApiClientUuid());
    const res = await this.adminFetch(
      `/users/${userId}/role-mappings/clients/${uuid}/composite`,
    );
    if (!res.ok) return [];
    const roles = (await res.json()) as Array<{ name: string }>;
    return roles.map((r) => r.name);
  }

  async createUser(input: CreateUserInput): Promise<KeycloakUserSummary> {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.temporaryPassword) {
      throw new BadRequestException('email and temporaryPassword are required');
    }
    if (!input.groupIds?.length) {
      throw new BadRequestException(
        'Assign at least one group (roles/permissions come from groups)',
      );
    }

    const createRes = await this.adminFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: email,
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        enabled: input.enabled ?? true,
        emailVerified: false,
        requiredActions: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'],
        credentials: [
          {
            type: 'password',
            value: input.temporaryPassword,
            temporary: true,
          },
        ],
      }),
    });

    if (createRes.status === 409) {
      throw new BadRequestException('User already exists');
    }
    if (!createRes.ok) {
      this.adminError('create user', createRes);
    }

    const location = createRes.headers.get('location');
    const userId = location?.split('/').pop();
    if (!userId) {
      throw new ServiceUnavailableException('User created but id missing');
    }

    for (const groupId of input.groupIds) {
      const join = await this.adminFetch(`/users/${userId}/groups/${groupId}`, {
        method: 'PUT',
      });
      if (!join.ok) {
        await this.adminFetch(`/users/${userId}`, { method: 'DELETE' });
        this.adminError(`assign group ${groupId}`, join);
      }
    }

    const getRes = await this.adminFetch(`/users/${userId}`);
    if (!getRes.ok) {
      throw new ServiceUnavailableException('User created but not readable');
    }
    const user = (await getRes.json()) as Parameters<
      KeycloakAdminService['getUserSummary']
    >[0];
    this.invalidateCatalog();
    return this.getUserSummary(user);
  }

  async updateUser(userId: string, input: UpdateUserInput) {
    if (input.enabled !== undefined) {
      const getRes = await this.adminFetch(`/users/${userId}`);
      if (!getRes.ok) {
        throw new BadRequestException('User not found');
      }
      const user = (await getRes.json()) as Record<string, unknown>;
      const put = await this.adminFetch(`/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...user, enabled: input.enabled }),
      });
      if (!put.ok) {
        throw new BadRequestException('Failed to update user');
      }
    }

    if (input.groupIds) {
      const currentRes = await this.adminFetch(`/users/${userId}/groups`);
      if (!currentRes.ok) {
        throw new BadRequestException('Failed to load user groups');
      }
      const current = (await currentRes.json()) as Array<{ id: string }>;
      const currentIds = new Set(current.map((g) => g.id));
      const nextIds = new Set(input.groupIds);

      for (const id of currentIds) {
        if (!nextIds.has(id)) {
          await this.adminFetch(`/users/${userId}/groups/${id}`, {
            method: 'DELETE',
          });
        }
      }
      for (const id of nextIds) {
        if (!currentIds.has(id)) {
          await this.adminFetch(`/users/${userId}/groups/${id}`, {
            method: 'PUT',
          });
        }
      }
    }

    const getRes = await this.adminFetch(`/users/${userId}`);
    if (!getRes.ok) throw new BadRequestException('User not found');
    const user = (await getRes.json()) as Parameters<
      KeycloakAdminService['getUserSummary']
    >[0];
    this.invalidateCatalog();
    return this.getUserSummary(user);
  }

  async createRealmRole(input: CreateRoleInput) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Role name is required');
    if (!/^[a-zA-Z0-9_.:-]+$/.test(name)) {
      throw new BadRequestException(
        'Role name may only contain letters, numbers, _ . : -',
      );
    }

    const createRes = await this.adminFetch('/roles', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: input.description?.trim() || `Created from LedgerOS`,
      }),
    });
    if (createRes.status === 409) {
      throw new BadRequestException('Realm role already exists');
    }
    if (!createRes.ok) {
      const text = await createRes.text();
      throw new BadRequestException(text || 'Failed to create realm role');
    }

    if (input.permissions?.length) {
      await this.setRealmRoleComposites(name, input.permissions);
    }

    this.invalidateCatalog();
    return this.getRealmRoleDetail(name);
  }

  async updateRealmRole(name: string, input: UpdateRoleInput) {
    const roleRes = await this.adminFetch(`/roles/${encodeURIComponent(name)}`);
    if (!roleRes.ok) throw new BadRequestException('Realm role not found');
    const role = (await roleRes.json()) as RoleRef & Record<string, unknown>;

    if (input.description !== undefined) {
      const put = await this.adminFetch(`/roles/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...role,
          description: input.description,
        }),
      });
      if (!put.ok) {
        throw new BadRequestException('Failed to update realm role');
      }
    }

    if (input.permissions !== undefined) {
      await this.setRealmRoleComposites(name, input.permissions);
    }

    this.invalidateCatalog();
    return this.getRealmRoleDetail(name);
  }

  async deleteRealmRole(name: string) {
    if (name.startsWith('default-roles-')) {
      throw new BadRequestException('Cannot delete default realm roles');
    }
    const res = await this.adminFetch(`/roles/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      throw new BadRequestException('Failed to delete realm role');
    }
    this.invalidateCatalog();
    return { deleted: true, name };
  }

  async createPermission(input: CreatePermissionInput) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Permission name is required');
    if (!/^[a-zA-Z0-9_.:-]+$/.test(name)) {
      throw new BadRequestException(
        'Permission name may only contain letters, numbers, _ . : -',
      );
    }

    const clientUuid = await this.getNestApiClientUuid();
    const createRes = await this.adminFetch(`/clients/${clientUuid}/roles`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: input.description?.trim() || `Created from LedgerOS`,
      }),
    });
    if (createRes.status === 409) {
      throw new BadRequestException('Permission already exists');
    }
    if (!createRes.ok) {
      const text = await createRes.text();
      throw new BadRequestException(text || 'Failed to create permission');
    }

    const getRes = await this.adminFetch(
      `/clients/${clientUuid}/roles/${encodeURIComponent(name)}`,
    );
    if (!getRes.ok) {
      throw new ServiceUnavailableException('Permission created but not readable');
    }
    this.invalidateCatalog();
    return (await getRes.json()) as RoleRef;
  }

  async deletePermission(name: string) {
    const clientUuid = await this.getNestApiClientUuid();
    const res = await this.adminFetch(
      `/clients/${clientUuid}/roles/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    );
    if (!res.ok && res.status !== 404) {
      throw new BadRequestException('Failed to delete permission');
    }
    this.invalidateCatalog();
    return { deleted: true, name };
  }

  async deleteGroup(groupId: string) {
    const res = await this.adminFetch(`/groups/${groupId}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      throw new BadRequestException('Failed to delete group');
    }
    this.invalidateCatalog();
    return { deleted: true, id: groupId };
  }

  async deleteUser(userId: string) {
    const res = await this.adminFetch(`/users/${userId}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      throw new BadRequestException('Failed to delete user');
    }
    this.invalidateCatalog();
    return { deleted: true, id: userId };
  }

  async getUserGroupIds(userId: string): Promise<string[]> {
    const res = await this.adminFetch(`/users/${userId}/groups`);
    if (!res.ok) return [];
    const groups = (await res.json()) as Array<{ id: string }>;
    return groups.map((g) => g.id);
  }

  private async getRealmRoleDetail(name: string) {
    const roleRes = await this.adminFetch(`/roles/${encodeURIComponent(name)}`);
    if (!roleRes.ok) throw new BadRequestException('Realm role not found');
    const role = (await roleRes.json()) as RoleRef;
    const composites = await this.getRealmRoleCompositePermissions(role.id);
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: composites,
    };
  }

  private async getRealmRoleCompositePermissions(
    roleId: string,
    clientUuid?: string,
  ): Promise<string[]> {
    const res = await this.adminFetch(`/roles-by-id/${roleId}/composites`);
    if (!res.ok) return [];
    const composites = (await res.json()) as Array<{
      name: string;
      clientRole?: boolean;
      containerId?: string;
    }>;
    const uuid = clientUuid ?? (await this.getNestApiClientUuid());
    return composites
      .filter((c) => c.clientRole && c.containerId === uuid)
      .map((c) => c.name);
  }

  private async setRealmRoleComposites(
    roleName: string,
    permissionNames: string[],
  ) {
    const roleRes = await this.adminFetch(
      `/roles/${encodeURIComponent(roleName)}`,
    );
    if (!roleRes.ok) throw new BadRequestException('Realm role not found');
    const role = (await roleRes.json()) as RoleRef;

    const desired = await this.resolveClientRoles(permissionNames);
    const currentNames = await this.getRealmRoleCompositePermissions(role.id);
    const current = await this.resolveClientRoles(currentNames);

    const desiredSet = new Set(desired.map((r) => r.name));
    const currentSet = new Set(current.map((r) => r.name));

    const toRemove = current.filter((r) => !desiredSet.has(r.name));
    const toAdd = desired.filter((r) => !currentSet.has(r.name));

    if (toRemove.length) {
      await this.adminFetch(`/roles-by-id/${role.id}/composites`, {
        method: 'DELETE',
        body: JSON.stringify(toRemove),
      });
    }
    if (toAdd.length) {
      await this.adminFetch(`/roles-by-id/${role.id}/composites`, {
        method: 'POST',
        body: JSON.stringify(toAdd),
      });
    }
  }

  async createGroup(input: CreateGroupInput) {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('Group name is required');
    }

    const createRes = await this.adminFetch('/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (createRes.status === 409) {
      throw new BadRequestException('Group already exists');
    }
    if (!createRes.ok) {
      const text = await createRes.text();
      throw new BadRequestException(text || 'Failed to create group');
    }

    const location = createRes.headers.get('location');
    const groupId = location?.split('/').pop();
    if (!groupId) {
      throw new ServiceUnavailableException('Group created but id missing');
    }

    await this.replaceGroupRoleMappings(
      groupId,
      input.realmRoles ?? [],
      input.permissions ?? [],
    );

    this.invalidateCatalog();
    const catalog = await this.getCatalog();
    const group = catalog.groups.find((g) => g.id === groupId);
    if (!group) {
      throw new ServiceUnavailableException('Group created but not readable');
    }
    return group;
  }

  async updateGroup(groupId: string, input: UpdateGroupInput) {
    if (input.realmRoles !== undefined || input.permissions !== undefined) {
      const current = await this.getGroupRoleNames(groupId);
      await this.replaceGroupRoleMappings(
        groupId,
        input.realmRoles ?? current.realmRoles,
        input.permissions ?? current.permissions,
      );
    }
    this.invalidateCatalog();
    const catalog = await this.getCatalog();
    const group = catalog.groups.find((g) => g.id === groupId);
    if (!group) throw new BadRequestException('Group not found');
    return group;
  }

  private async getNestApiClientUuid(): Promise<string> {
    if (this.clientUuidCache && this.clientUuidCache.expiresAt > Date.now()) {
      return this.clientUuidCache.id;
    }
    const clientsRes = await this.adminFetch(
      `/clients?clientId=${encodeURIComponent(this.apiClientId)}`,
    );
    if (!clientsRes.ok) {
      throw new ServiceUnavailableException(
        'Failed to resolve nest-api client',
      );
    }
    const clients = (await clientsRes.json()) as Array<{ id: string }>;
    const id = clients[0]?.id;
    if (!id) {
      throw new ServiceUnavailableException('nest-api client not found');
    }
    this.clientUuidCache = { id, expiresAt: Date.now() + 5 * 60_000 };
    return id;
  }

  private async resolveRealmRoles(names: string[]): Promise<RoleRef[]> {
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    const roles: RoleRef[] = [];
    for (const name of unique) {
      const getRes = await this.adminFetch(
        `/roles/${encodeURIComponent(name)}`,
      );
      if (!getRes.ok) {
        throw new BadRequestException(`Unknown realm role: ${name}`);
      }
      roles.push((await getRes.json()) as RoleRef);
    }
    return roles;
  }

  private async resolveClientRoles(names: string[]): Promise<RoleRef[]> {
    const clientUuid = await this.getNestApiClientUuid();
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    const roles: RoleRef[] = [];
    for (const name of unique) {
      const getRes = await this.adminFetch(
        `/clients/${clientUuid}/roles/${encodeURIComponent(name)}`,
      );
      if (!getRes.ok) {
        throw new BadRequestException(`Unknown permission: ${name}`);
      }
      roles.push((await getRes.json()) as RoleRef);
    }
    return roles;
  }

  private async getGroupRoleNames(groupId: string) {
    const mapRes = await this.adminFetch(`/groups/${groupId}/role-mappings`);
    if (!mapRes.ok) {
      return { realmRoles: [] as string[], permissions: [] as string[] };
    }
    const maps = (await mapRes.json()) as {
      realmMappings?: Array<{ name: string }>;
      clientMappings?: Record<string, { mappings?: Array<{ name: string }> }>;
    };
    return {
      realmRoles: (maps.realmMappings ?? []).map((r) => r.name),
      permissions:
        maps.clientMappings?.[this.apiClientId]?.mappings?.map((r) => r.name) ??
        [],
    };
  }

  private async replaceGroupRoleMappings(
    groupId: string,
    realmRoleNames: string[],
    permissionNames: string[],
  ) {
    const clientUuid = await this.getNestApiClientUuid();
    const current = await this.getGroupRoleNames(groupId);

    const desiredRealm = await this.resolveRealmRoles(realmRoleNames);
    const desiredPerms = await this.resolveClientRoles(permissionNames);

    const currentRealmRefs = await this.resolveRealmRoles(current.realmRoles);
    const currentPermRefs = await this.resolveClientRoles(current.permissions);

    const desiredRealmSet = new Set(desiredRealm.map((r) => r.name));
    const desiredPermSet = new Set(desiredPerms.map((r) => r.name));

    const realmToRemove = currentRealmRefs.filter(
      (r) => !desiredRealmSet.has(r.name),
    );
    const realmToAdd = desiredRealm.filter(
      (r) => !current.realmRoles.includes(r.name),
    );
    const permsToRemove = currentPermRefs.filter(
      (r) => !desiredPermSet.has(r.name),
    );
    const permsToAdd = desiredPerms.filter(
      (r) => !current.permissions.includes(r.name),
    );

    if (realmToRemove.length) {
      await this.adminFetch(`/groups/${groupId}/role-mappings/realm`, {
        method: 'DELETE',
        body: JSON.stringify(realmToRemove),
      });
    }
    if (realmToAdd.length) {
      await this.adminFetch(`/groups/${groupId}/role-mappings/realm`, {
        method: 'POST',
        body: JSON.stringify(realmToAdd),
      });
    }
    if (permsToRemove.length) {
      await this.adminFetch(
        `/groups/${groupId}/role-mappings/clients/${clientUuid}`,
        {
          method: 'DELETE',
          body: JSON.stringify(permsToRemove),
        },
      );
    }
    if (permsToAdd.length) {
      await this.adminFetch(
        `/groups/${groupId}/role-mappings/clients/${clientUuid}`,
        {
          method: 'POST',
          body: JSON.stringify(permsToAdd),
        },
      );
    }
  }
}
