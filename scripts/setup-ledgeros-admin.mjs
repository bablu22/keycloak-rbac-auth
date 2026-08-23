#!/usr/bin/env node
/**
 * Grant realm-management roles to the ledgeros-admin service account.
 * Run once after Keycloak import (or when admin provisioning fails with 403):
 *
 *   node scripts/setup-ledgeros-admin.mjs
 *
 * Uses master admin only for this one-time bootstrap — the API uses
 * client_credentials (ledgeros-admin) at runtime.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const KEYCLOAK = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const REALM = process.env.KEYCLOAK_REALM || 'erp-realm';
const ADMIN_CLIENT = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'ledgeros-admin';

const REALM_MGMT_ROLES = [
  'manage-users',
  'view-users',
  'query-users',
  'manage-groups',
  'view-groups',
  'query-groups',
  'manage-realm',
  'view-realm',
  'manage-clients',
  'view-clients',
  'query-clients',
];

async function masterToken() {
  const body = new URLSearchParams({
    client_id: 'admin-cli',
    username: process.env.KEYCLOAK_ADMIN || 'admin',
    password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
    grant_type: 'password',
  });
  const res = await fetch(
    `${KEYCLOAK}/realms/master/protocol/openid-connect/token`,
    { method: 'POST', body },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json.access_token;
}

async function getClient(token, clientId) {
  const list = await fetch(
    `${KEYCLOAK}/admin/realms/${REALM}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  ).then((r) => r.json());
  if (list[0]) return list[0];

  if (clientId !== ADMIN_CLIENT) {
    throw new Error(`Client not found: ${clientId}`);
  }

  const create = await fetch(`${KEYCLOAK}/admin/realms/${REALM}/clients`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientId: ADMIN_CLIENT,
      name: 'LedgerOS Admin API',
      enabled: true,
      publicClient: false,
      secret: 'ledgeros-admin-secret-change-me',
      protocol: 'openid-connect',
      bearerOnly: false,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: true,
      fullScopeAllowed: true,
    }),
  });
  if (!create.ok && create.status !== 409) {
    throw new Error(`Failed to create ${ADMIN_CLIENT}: ${await create.text()}`);
  }
  const again = await fetch(
    `${KEYCLOAK}/admin/realms/${REALM}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  ).then((r) => r.json());
  if (!again[0]) throw new Error(`Client not found after create: ${clientId}`);
  console.log(`Created ${ADMIN_CLIENT} client in ${REALM}.`);
  return again[0];
}

async function getServiceAccountUserId(token, clientInternalId) {
  const user = await fetch(
    `${KEYCLOAK}/admin/realms/${REALM}/clients/${clientInternalId}/service-account-user`,
    { headers: { Authorization: `Bearer ${token}` } },
  ).then((r) => r.json());
  if (!user.id) throw new Error('Service account user not found');
  return user.id;
}

async function assignRealmMgmtRoles(token, userId) {
  const realmMgmt = await getClient(token, 'realm-management');
  const available = await fetch(
    `${KEYCLOAK}/admin/realms/${REALM}/users/${userId}/role-mappings/clients/${realmMgmt.id}/available`,
    { headers: { Authorization: `Bearer ${token}` } },
  ).then((r) => r.json());

  const toAssign = available.filter((r) => REALM_MGMT_ROLES.includes(r.name));
  if (!toAssign.length) {
    console.log('All realm-management roles already assigned.');
    return;
  }

  const res = await fetch(
    `${KEYCLOAK}/admin/realms/${REALM}/users/${userId}/role-mappings/clients/${realmMgmt.id}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toAssign),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to assign roles: ${await res.text()}`);
  }
  console.log(
    `Assigned ${toAssign.length} realm-management roles to ${ADMIN_CLIENT} service account.`,
  );
}

const token = await masterToken();
const adminClient = await getClient(token, ADMIN_CLIENT);
if (!adminClient.serviceAccountsEnabled) {
  throw new Error(`${ADMIN_CLIENT} does not have serviceAccountsEnabled`);
}
const userId = await getServiceAccountUserId(token, adminClient.id);
await assignRealmMgmtRoles(token, userId);
console.log('Done. Sync secrets: node scripts/sync-keycloak-secrets.mjs');
