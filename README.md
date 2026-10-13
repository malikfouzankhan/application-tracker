# jobs.fouzan.dev

Personal job-search command center: daily ingestion of public job boards, a Claude MCP connector
that assesses jobs and prepares application packs, and a dashboard to review, apply and track.
Single user. The full spec lives in [claude.md](claude.md).

## Local development

Requirements: Node 22+, pnpm (version pinned in `package.json`).

```bash
pnpm install
cp .env.example .env.local   # then fill in the values (see "Environment variables")
pnpm db:migrate              # applies migrations (uses DIRECT_DATABASE_URL)
pnpm dev                     # http://localhost:6677
```

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server on port 6677 |
| `pnpm typecheck && pnpm lint && pnpm test` | Checks (same as CI) |
| `pnpm db:generate` / `pnpm db:migrate` | Create / apply Drizzle migrations |
| `pnpm ingest` | Run ingestion (`--only=slug1,slug2`, `--no-hn`) |
| `pnpm seed:companies` | Add the seed watchlist (verifies each board first) |
| `pnpm seed:claims` / `pnpm seed:answers` | Load resume claims / profile from `seed-data/` (gitignored, personal) |

To test the Claude connector against your machine, expose port 6677 with a tunnel (e.g. ngrok) and set
`DEV_TUNNEL_HOST` in `.env.local` to the tunnel host so Next.js dev resources work through it.

## Environment variables

Validated at boot by `src/lib/env.ts`. Never prefix anything except the Clerk publishable key with
`NEXT_PUBLIC_`.

| Variable | Where it comes from |
|---|---|
| `APP_URL` | `https://jobs.fouzan.dev` in production, `http://localhost:6677` locally |
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler** (port 6543) |
| `DIRECT_DATABASE_URL` | Supabase → Connect → **Session pooler** (port 5432); migrations, scripts, Actions |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk → Configure → API keys (`pk_live`/`sk_live` in production) |
| `OWNER_CLERK_USER_ID` | Clerk → Users → your user (differs between dev and production instances) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API keys (new `sb_secret_...` key) |
| `PDF_SIGNING_SECRET` | `openssl rand -base64 32` (use a different value per environment) |
| `CLERK_DISABLE_AUTO_PROXY` | Production only: `1`. Clerk v7 otherwise routes its scripts through `/__clerk` on Vercel, which this app does not serve (blank sign-in page). Clerk is reached via the `clerk.fouzan.dev` DNS record instead. |

GitHub Actions secrets: `DIRECT_DATABASE_URL` (ingestion, backup), `BACKUP_PASSPHRASE` (backup).

## Operations

### Emergency: cut Claude off

1. **Settings → Disable MCP** (kill switch). Every tool call fails immediately with `MCP_DISABLED`.
2. **Settings → Revoke** the client to block that OAuth client here.
3. To end the OAuth grant itself: Clerk dashboard → OAuth applications → the claude.ai client → revoke
   or delete it. Refresh tokens never expire on Clerk's defaults, so do this whenever a grant should end.

### Rotating secrets

Rotate after any suspected leak, and treat values shown in screenshots or logs as leaked.

| Secret | How to rotate | Then |
|---|---|---|
| `CLERK_SECRET_KEY` | Clerk → API keys → create a new secret key, delete the old one | Update Vercel env, redeploy |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Only changes if the Clerk instance/domain changes | Update Vercel env, redeploy |
| Supabase DB password (`DATABASE_URL`, `DIRECT_DATABASE_URL`) | Supabase → Database → Reset password | Update both URLs in Vercel, the GitHub secret and `.env.local` |
| `SUPABASE_SECRET_KEY` | Supabase → API keys → create a new secret key, then delete the old one | Update Vercel env, redeploy |
| `PDF_SIGNING_SECRET` | `openssl rand -base64 32` | Update Vercel env, redeploy. All outstanding resume links stop working (they are 24h links anyway) |
| `BACKUP_PASSPHRASE` | Generate a new 32+ char passphrase, store it in your password manager | Update the GitHub secret. Old backups still need the old passphrase |
| GitHub secrets | Repo → Settings → Secrets and variables → Actions → update | Re-run the workflow to confirm |

### Backups

`.github/workflows/backup.yml` runs every Sunday 03:00 IST (and on demand): `pg_dump` of the app
schemas, encrypted with `BACKUP_PASSPHRASE` (AES-256), stored as a workflow artifact for 56 days
(the last 8 weeks). Restore:

```bash
gpg --batch --passphrase "$BACKUP_PASSPHRASE" -d jobs-YYYY-MM-DD.dump.gpg > jobs.dump
pg_restore --no-owner --no-privileges --clean --if-exists -d "$DIRECT_DATABASE_URL" jobs.dump
```

Keep `BACKUP_PASSPHRASE` in a password manager: without it the backups cannot be decrypted.

### Ingestion

`.github/workflows/ingest.yml` runs daily at 05:30 IST from the default branch. It exits non-zero
(GitHub emails you) when a source fails; a board that returns 404 is paused automatically and
reported once. Run history is on the Stats page.

## Production setup checklist

Do these once, in order. Items marked **(you)** need dashboard access.

**1. Supabase (you)**
- [ ] Project Settings → Data API: disabled (already done).
- [ ] Note the region (`ap-south-1`); Vercel functions run in `bom1` (Mumbai) via `vercel.json`.
- [ ] Database → Backups: the free plan has none; the backup workflow covers this.

**2. Clerk production instance (you)**
- [ ] Clerk → switch to **Production** → create the instance for domain `fouzan.dev`.
- [ ] Add the DNS records Clerk lists (`clerk.`, `accounts.`, `clkmail.`, DKIM records) at your DNS provider; wait for verification.
- [ ] User & authentication: **Email address** on with **Email verification code**; **Password off**; all social providers off.
- [ ] Paths: sign-in page on the application domain at `/sign-in`.
- [ ] Sign up once at `https://jobs.fouzan.dev/sign-in` (or create the user in Users), then copy the user ID.
- [ ] Restrictions → Sign-up mode: **Restricted** (invitation only) once your account exists.
- [ ] OAuth applications → Settings: enable **Client ID Metadata Documents (CIMD)** and keep **Dynamic client registration** on; consent screen on.
- [ ] Domains → Allowed subdomains: restrict to `jobs.fouzan.dev`.

**3. Vercel (you)**
- [ ] Import the GitHub repo; framework Next.js; production branch `main`.
- [ ] Environment variables (Production): `APP_URL=https://jobs.fouzan.dev`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (**live** keys), `OWNER_CLERK_USER_ID` (**production** user), `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `PDF_SIGNING_SECRET` (**new** value), `CLERK_DISABLE_AUTO_PROXY=1`. Do not set `DEV_TUNNEL_HOST`.
- [ ] Domains: add `jobs.fouzan.dev`; at your DNS provider add `CNAME jobs → cname.vercel-dns.com` (or what Vercel shows).
- [ ] Deploy (merge `development` into `main`).

**4. GitHub (you)**
- [ ] Secrets: `DIRECT_DATABASE_URL` (done), `BACKUP_PASSPHRASE` (new, 32+ chars, saved in a password manager).
- [ ] Settings → Code security: secret scanning **and push protection** on; Dependabot alerts and security updates on.
- [ ] Settings → Branches: protect `main`, require the **CI** check to pass.
- [ ] Actions: run **Backup database** once manually and confirm the artifact appears.

**5. Database**
- [ ] Same Supabase project as development: migrations are already applied. A new project would need
      `pnpm db:migrate`, `pnpm seed:companies`, `pnpm seed:answers`, `pnpm seed:claims` with its URLs.

**6. Claude connector (you)**
- [ ] claude.ai → Settings → Connectors: remove the ngrok connector; add `https://jobs.fouzan.dev/api/mcp`.
- [ ] Connect → sign in with the production Clerk account → approve.
- [ ] Clerk (production) → OAuth applications: confirm the client id is a URL (CIMD).
- [ ] Ask Claude to call `ping`, then `get_briefing`.
- [ ] Create the 06:30 IST scheduled task with the daily routine (claude.md, Appendix A) and auto-approve the connector's tools.

**7. Verify production**
- [ ] `https://jobs.fouzan.dev` redirects to sign-in when signed out; the dashboard loads after sign-in.
- [ ] `curl -i -X POST https://jobs.fouzan.dev/api/mcp` returns 401 with a `resource_metadata` URL on `https://jobs.fouzan.dev`.
- [ ] Security headers: check `https://jobs.fouzan.dev` on securityheaders.com.
- [ ] Actions → **Ingest jobs** → Run workflow; check Stats → Ingestion runs.
- [ ] Open a resume link from a pack; it should work signed out within 24h and fail after.
