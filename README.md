# LedgerOS — Keycloak-backed ERP lab

A monorepo reference app: **NestJS BFF/API** + **React SPA** + **Keycloak** identity, with invoices, payroll, inventory, and admin user management.

Use this README to rebuild the full stack from scratch on a new machine or fork it into another project.

---

## What you get

| Layer | Tech | Port |
| --- | --- | --- |
| Web SPA | Vite + React 19 + Tailwind 4 | `5173` |
| API / BFF | NestJS 11 + express-session | `3000` |
| Identity | Keycloak 26 | `8080` |
| ERP database | Postgres 16 (`ledgeros` DB) | `5433` (host) |
| Keycloak database | Postgres 16 (`keycloak` DB) | internal |
| Sessions + OIDC cache | Redis 7 | `6379` |
| Dev email | Mailpit | `8025` (UI), `1025` (SMTP) |

**Auth model:** Browser uses cookie sessions via the BFF (`/auth/login` → Keycloak → `/auth/callback`). Tokens stay server-side in Redis. Mobile/API clients can call `GET /me` with a Bearer JWT.

**No self-registration.** Admins provision users from the People page (`/app/users`).

---

## Architecture

```
Browser (5173)
    │  cookie session + CSRF
    ▼
NestJS BFF (3000)  ──OIDC/PKCE──►  Keycloak (8080)
    │                                    │
    │ Bearer (from session)              │ users, roles, permissions
    ▼                                    ▼
ERP routes (/erp/*)              Postgres keycloak DB
    │
    ▼
Postgres ledgeros DB
    │
Redis (sessions)
```

---

## Prerequisites

Install on your machine:

- **Node.js** 18+ (20+ recommended)
- **pnpm** 8+ (`corepack enable && corepack prepare pnpm@8.15.5 --activate`)
- **Docker** + **Docker Compose**
- **Git**

Optional: `curl` for health checks.

---

## Step-by-step: build from scratch

### 1. Get the code

```bash
git clone <your-repo-url> ledgeros
cd ledgeros
```

Or copy this folder into a new repo.

### 2. Start infrastructure

```bash
docker compose up -d
```

Wait until services are healthy (~30–60s):

```bash
curl -sf http://localhost:8080/health/ready && echo "Keycloak ready"
curl -sf http://localhost:3000/health 2>/dev/null || true   # API not up yet — OK
```

**What Docker starts:**

- **Postgres** — creates `keycloak` DB on first boot; `docker/postgres/init-ledgeros.sh` also creates the `ledgeros` user/database
- **Keycloak** — imports `keycloak/erp-realm.json` on **first volume only** (`--import-realm`)
- **Redis** — session store for the API
- **Mailpit** — captures verification/reset emails in dev

> **Existing Postgres volume?** If `ledgeros` DB is missing, create it manually:
> ```bash
> docker compose exec postgres psql -U keycloak -d keycloak -c \
>   "CREATE USER ledgeros WITH PASSWORD 'ledgeros'; CREATE DATABASE ledgeros OWNER ledgeros;"
> ```
> Or reset everything: `docker compose down -v` (wipes Keycloak + Postgres data).

### 3. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` if needed. At minimum set a long random `SESSION_SECRET`:

```env
SESSION_SECRET=replace-with-a-long-random-string-at-least-32-chars
```

### 4. Bootstrap Keycloak clients

Keycloak regenerates client secrets on realm import. Sync them into `.env`, then create the admin service account:

```bash
node scripts/sync-keycloak-secrets.mjs
node scripts/setup-ledgeros-admin.mjs
node scripts/sync-keycloak-secrets.mjs   # pick up ledgeros-admin secret
```

| Script | Purpose |
| --- | --- |
| `sync-keycloak-secrets.mjs` | Writes live secrets for `web-bff`, `nest-api`, `ledgeros-admin` → `apps/api/.env` |
| `setup-ledgeros-admin.mjs` | Creates `ledgeros-admin` client + grants realm-management roles (not in realm JSON — importing it breaks KC 26) |

### 5. Install dependencies

```bash
pnpm install
```

### 6. Run the apps

```bash
pnpm dev
```

Or separately:

```bash
pnpm --filter api dev    # http://localhost:3000
pnpm --filter web dev    # http://localhost:5173
```

### 7. Sign in

1. Open **http://localhost:5173**
2. Click **Sign in**
3. Use a demo account (password for all: `password`):

| Email | Role hint |
| --- | --- |
| `admin@erp.local` | super_admin |
| `alice@erp.local` | admin |
| `bob@erp.local` | manager |
| `carol@erp.local` | accountant |
| `dave@erp.local` | hr |
| `erin@erp.local` | sales |

After login you should land on **http://localhost:5173/app**.

---

## Project structure

```
.
├── apps/
│   ├── api/                 NestJS — auth BFF, ERP modules, Keycloak guards
│   │   ├── src/auth/        OIDC login/callback, Redis sessions, CSRF
│   │   ├── src/erp/         invoices, inventory, payroll, users admin
│   │   └── .env.example
│   └── web/                 Vite React SPA
│       └── src/
│           ├── auth/        AuthProvider, RequireAuth
│           └── pages/       Dashboard, Invoices, Payroll, Inventory, Users…
├── packages/
│   ├── eslint-config/       shared ESLint presets
│   ├── jest-config/         shared Jest presets
│   └── typescript-config/   shared tsconfigs
├── keycloak/
│   └── erp-realm.json       realm seed (users, roles, clients — first import only)
├── docker/
│   └── postgres/            ledgeros DB init script
├── scripts/
│   ├── sync-keycloak-secrets.mjs
│   └── setup-ledgeros-admin.mjs
├── docker-compose.yml
├── SECURITY.md              production hardening checklist
└── turbo.json
```

---

## Keycloak clients (in `erp-realm.json`)

| Client | Type | Used by |
| --- | --- | --- |
| `web-bff` | confidential | NestJS BFF — OIDC redirect to `/auth/callback` |
| `nest-api` | confidential | JWT validation on ERP routes |
| `react-client` | public | legacy/alternate SPA client (redirect URIs on 5173) |
| `mobile-app` | public | deep-link callback for future mobile |

**Runtime admin client:** `ledgeros-admin` — created by `setup-ledgeros-admin.mjs`, uses `client_credentials` for People admin API.

---

## Where data lives

| Data | Store |
| --- | --- |
| Users, passwords, roles, groups, permissions | Keycloak → Postgres `keycloak` DB |
| Invoices, inventory, payroll, admin audit | Postgres `ledgeros` DB |
| Web sessions + OIDC tokens | Redis |
| Realm seed config | `keycloak/erp-realm.json` (first import only) |

---

## Environment variables

Full list in `apps/api/.env.example`. Key ones:

| Variable | Dev default | Notes |
| --- | --- | --- |
| `KEYCLOAK_URL` | `http://localhost:8080` | |
| `KEYCLOAK_REALM` | `erp-realm` | |
| `WEB_ORIGIN` | `http://localhost:5173` | CORS + post-login redirect |
| `API_PUBLIC_URL` | `http://localhost:3000` | OAuth redirect base |
| `DATABASE_URL` | `postgresql://ledgeros:ledgeros@localhost:5433/ledgeros` | |
| `REDIS_URL` | `redis://localhost:6379` | |
| `COOKIE_SECURE` | `false` | must be `true` in production behind HTTPS |

Web optional: `VITE_API_URL` (defaults to `http://localhost:3000`).

---

## Common commands

```bash
pnpm dev              # API + web
pnpm build            # production build
pnpm lint             # ESLint across workspace
pnpm test             # unit tests
pnpm --filter api test:e2e
pnpm format           # Prettier
```

---

## Troubleshooting

### API crashes on startup (`fetch failed` / Keycloak not ready)

Keycloak may still be starting. Wait and retry, or check:

```bash
docker compose logs keycloak --tail 50
curl http://localhost:8080/health/ready
```

The API retries OIDC discovery for ~60s on boot.

### Login redirect goes to wrong host (e.g. `:3000/app` instead of `:5173/app`)

Ensure `WEB_ORIGIN=http://localhost:5173` in `apps/api/.env` and restart the API.

### 403 on POST (approve invoice, create user, etc.)

Cookie-session mutations need CSRF. The web client fetches `/auth/me` and sends `X-CSRF-Token` automatically. If testing with curl, get a token from `/auth/me` first.

### Admin People page returns 403

Run `node scripts/setup-ledgeros-admin.mjs` and re-sync secrets. Sign in as a user with `user_manage` permission (e.g. `admin@erp.local`).

### Secrets out of sync after realm re-import

```bash
node scripts/sync-keycloak-secrets.mjs
node scripts/setup-ledgeros-admin.mjs
node scripts/sync-keycloak-secrets.mjs
```

### Reset everything (clean slate)

```bash
docker compose down -v
docker compose up -d
# wait for Keycloak, then repeat steps 3–6
```

---

## Replicating in another project

1. Copy the monorepo layout (`apps/api`, `apps/web`, `keycloak/`, `docker/`, `scripts/`, `docker-compose.yml`).
2. Rename realm/clients in `keycloak/erp-realm.json` and update `apps/api/.env.example`.
3. Adjust `WEB_ORIGIN`, redirect URIs in realm JSON (`web-bff` → your API callback URL).
4. Keep the bootstrap order: **Docker → `.env` → sync secrets → setup admin → sync again → pnpm dev**.
5. Read `SECURITY.md` before deploying anywhere beyond localhost.

---

## Production

See **[SECURITY.md](./SECURITY.md)** for the full checklist: strong secrets, Redis auth, HTTPS cookies, Keycloak prod mode, DB migrations, token audience, etc.

---

## License

Private / UNLICENSED — adjust for your fork.
