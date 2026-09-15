# Personal productivity dashboard

React/TypeScript frontend with a Cloudflare Worker API and D1 database.

## Local development

Use Node.js 24 LTS or a compatible version supported by Wrangler.

```powershell
npm install
Copy-Item worker/.dev.vars.example worker/.dev.vars
npm run db:migrate:local
npm run dev:api
```

In a second terminal:

```powershell
npm run dev
```

Open http://127.0.0.1:5173. Vite forwards `/api/*` to the Worker at
http://127.0.0.1:8787. Both development servers bind to loopback. Use the configured
frontend origin exactly; localhost and 127.0.0.1 are different browser origins.
Local D1 data persists in `worker/.wrangler/` and is excluded from source control.
Never use real personal data with the local development identity.

The checked-out development configuration signs in with:

```text
Email: developer@localhost
Password: local-dashboard-dev-only
Role: owner
```

These values live only in the ignored `worker/.dev.vars` file. Change the local
password before using shared development machines. On the first successful sign-in,
the Worker creates the user and stores only a salted PBKDF2 password hash in D1.
It then issues a random 12-hour session whose token is hashed in the database and
whose browser cookie is HTTP-only with `SameSite=Strict`.

Each user has a UUID primary key and one role: `owner`, `admin`, `member`, or
`viewer`. Until account management is added to Settings, assign a local role with:

```powershell
npx wrangler d1 execute DB --local --config worker/wrangler.jsonc --command "UPDATE users SET role = 'viewer' WHERE email = 'developer@localhost'"
```

## API foundation

| Endpoint | Access | Result |
| --- | --- | --- |
| `GET /api/health` | Public | Process health; no database or personal information |
| `GET /api/auth/config` | Public | Selects the local form or Cloudflare Access flow |
| `POST /api/auth/local/login` | Local loopback only | Verifies local credentials and creates a session |
| `POST /api/auth/local/logout` | Local loopback only | Revokes the local session |
| `GET /api/session` | Authenticated | Provisions/loads the user and returns ID, email, role, and environment |
| `GET /api/ready` | Authenticated | Checks the migrated D1 users table |

Responses use `{ data: ... }` or `{ error: { code, message }, requestId }`.
The authentication gate prevents the private shell from rendering until the
session endpoint succeeds. CRUD routes and notification delivery are the next
implementation stages, not part of this setup.

The initial migration creates users, settings, todos, notes, and reminders with
ownership foreign keys, constraints, and query indexes. Timestamps are UTC Unix
seconds; the application must update `updated_at` on each future mutation.
Recurrence and notification subscription/delivery tables will be introduced
alongside those features. The app verifies its own password-backed session before
rendering private content. Production permits the configured owner email only and
assigns that account the `admin` role.

## Validation

```powershell
npm run typecheck:api
npm test
npm run lint
npm run build
npm run build:api
```

`build:api` bundles with Wrangler's dry-run mode and does not deploy.
Authentication tests cover password login, session handling, unauthorized email
addresses, default-deny access, and origin checks.

## Production configuration

Production uses the ignored `worker/wrangler.production.jsonc` file so live
account identifiers and addresses remain separate from the public repository.
Copy `worker/wrangler.production.example.jsonc`, fill in the production values,
and store the login password only as the `LOCAL_BOOTSTRAP_PASSWORD` Worker
secret. Deploy with `npm run deploy:production`.

1. Copy `worker/wrangler.production.example.jsonc` to the ignored
   `worker/wrangler.production.jsonc` file.
2. Fill in the production Worker URL, owner email, and D1 database ID.
3. Keep `ENVIRONMENT=production` and `AUTH_MODE=password`. Never upload
   `.dev.vars` or `worker/wrangler.production.jsonc`.
4. Store the production password with Wrangler as the
   `LOCAL_BOOTSTRAP_PASSWORD` secret; never place it in a config or frontend file.
5. Apply D1 migrations remotely only after checking the target database, then run
   `npm run deploy:production`.

The production Worker is deployed separately from this repository. Future
mutation endpoints still need input validation, ownership checks, rate limits,
and relevant tests. Secrets belong in Wrangler secrets, never Vite environment
variables.
Reference: [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/),
[Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/),
and [Cloudflare Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
