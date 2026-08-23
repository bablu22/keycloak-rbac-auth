#!/usr/bin/env node
/**
 * Sync Keycloak client secrets into apps/api/.env after realm import.
 * Usage: node scripts/sync-keycloak-secrets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYCLOAK = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const REALM = process.env.KEYCLOAK_REALM || 'erp-realm';
const ENV_PATH = path.join(__dirname, '../apps/api/.env');

async function adminToken() {
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

async function clientSecret(token, clientId) {
  const list = await fetch(
    `${KEYCLOAK}/admin/realms/${REALM}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  ).then((r) => r.json());
  if (!list[0]) throw new Error(`Client not found: ${clientId}`);
  const secret = await fetch(
    `${KEYCLOAK}/admin/realms/${REALM}/clients/${list[0].id}/client-secret`,
    { headers: { Authorization: `Bearer ${token}` } },
  ).then((r) => r.json());
  return secret.value;
}

function upsertEnv(text, key, value) {
  if (value === undefined || value === 'undefined' || !value) {
    return text;
  }
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, line);
  return `${text.trimEnd()}\n${line}\n`;
}

const token = await adminToken();
const bff = await clientSecret(token, 'web-bff');
const api = await clientSecret(token, 'nest-api');

let env = fs.existsSync(ENV_PATH)
  ? fs.readFileSync(ENV_PATH, 'utf8')
  : fs.readFileSync(`${ENV_PATH}.example`, 'utf8');

env = upsertEnv(env, 'KEYCLOAK_BFF_SECRET', bff);
env = upsertEnv(env, 'KEYCLOAK_CLIENT_SECRET', api);

try {
  const admin = await clientSecret(token, 'ledgeros-admin');
  env = upsertEnv(env, 'KEYCLOAK_ADMIN_CLIENT_SECRET', admin);
  console.log(
    'Updated apps/api/.env with web-bff, nest-api, and ledgeros-admin secrets.',
  );
} catch {
  console.log(
    'Updated web-bff and nest-api secrets. ledgeros-admin missing — run: node scripts/setup-ledgeros-admin.mjs',
  );
}

fs.writeFileSync(ENV_PATH, env);
console.log('Restart the API: pnpm --filter api dev');
