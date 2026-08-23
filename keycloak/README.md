# Keycloak notes

See the **[root README](../README.md)** for the full step-by-step bootstrap guide.

Quick reference:

```bash
docker compose up -d
cp apps/api/.env.example apps/api/.env
node scripts/sync-keycloak-secrets.mjs
node scripts/setup-ledgeros-admin.mjs
node scripts/sync-keycloak-secrets.mjs
pnpm dev
```

- Realm seed: `erp-realm.json` (imported on first Postgres volume only)
- `ledgeros-admin` is **not** in the JSON — run `setup-ledgeros-admin.mjs` after import
- Default Keycloak login theme (no custom theme in this repo)
