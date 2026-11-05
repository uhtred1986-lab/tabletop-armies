# Platform: Vercel, Neon, environment, deploys

Same platform as Gullet Cove (decided 5 Nov 2026): Next.js 16 on Vercel, Neon Postgres via Drizzle, Google sign-in.
The deploy and backup scripts are copies of Gullet Cove's (`scripts/vercel-build.mts`, `scripts/lib/deploy-plan.mts`,
`scripts/lib/neon-backup.mts`).

## Environment variables

Names only; values live in `.env.local`, Vercel and the cloud environment, never in git or a chat.

| Name | Where | What |
| --- | --- | --- |
| `DATABASE_URL` | Vercel (Production), `.env.local`, cloud | Neon connection string of the `production` branch (pooled host is fine) |
| `DB_DRIVER` | cloud sessions only | `neon-ws`: talk to Neon over WebSockets where TCP 5432 is blocked |
| `AUTH_SECRET` | Vercel, `.env.local` | 32+ random characters; signs the session and OAuth-flow cookies |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Vercel, `.env.local` | Google OAuth client (Web application) |
| `OWNER_EMAILS` | Vercel, `.env.local` | comma-separated Google addresses that may sign in |
| `AUTH_DISABLED` | `.env.local` only | `1` skips sign-in under `next dev` only; ignored in a build and on Vercel |
| `NEON_API_KEY`, `NEON_PROJECT_ID` | Vercel (Production) | the pre-migration backup branch; without them a deploy with a pending migration fails before migrating |
| `PRODUCTION_DATABASE_HOST` | Vercel (Preview), optional | lets a preview with its own Neon branch migrate it; previews are off by default |

## Deploys and the database

- `vercel.json` deploys **`main` only** (`git.deploymentEnabled`), region `fra1`, build command `npm run vercel-build`.
- A production build reads `drizzle.__drizzle_migrations` (read-only). Nothing pending: `next build`. Something
  pending: a Neon branch `pre-migrate-<timestamp>-<tag>` of production first, then `drizzle-kit migrate`, then old
  backup branches pruned to the newest two, then `next build`. No backup, no migration: the build stops.
- A PR or a pushed branch migrates nothing. Test a new column on a throwaway Neon branch or on PGlite (`npm test` applies
  every migration in `drizzle/` to an empty in-memory Postgres).
- Never `db:migrate` / `db:push` by hand against production; never reset or delete the `production` branch.

## Backups

- Neon keeps point-in-time history; the deploy adds a `pre-migrate-*` branch before every migration.
- Before a manual write to production (a repair, an import script): a branch `pre-<task>-<yyyymmdd>`, named in the PR.
- A JSON export of the owner's tables (`OWNER_TABLES` in `src/db/schema.ts`) is milestone M1; packs are never in it.

## First-time setup (Heyhey, once)

1. **Neon:** a new project "tabletop-armies" (region Frankfurt, `aws-eu-central-1`). Copy the connection string of the
   `production` branch and the project id. Or, in Vercel, *Storage → Neon* creates it and sets `DATABASE_URL`; the
   project id must then still be the real project's (the integration's own prefixed id may point at an empty project,
   as in Gullet Cove).
2. **Neon API key:** Account settings → API keys → new key, for the backup branch.
3. **Google OAuth client:** Google Cloud console → APIs & Services → Credentials → OAuth client ID (Web application),
   or add to Gullet Cove's client. Authorised redirect URIs: `https://<vercel-domain>/api/auth/callback/google` and
   `http://localhost:3000/api/auth/callback/google`.
4. **Vercel:** Add New → Project → import `uhtred1986-lab/tabletop-armies`. Framework Next.js; build command comes from
   `vercel.json`. Environment (Production): `DATABASE_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `OWNER_EMAILS`, `NEON_API_KEY`, `NEON_PROJECT_ID`. Deployment protection may stay off: sign-in is the lock.
5. **Redeploy `main`.** The first build finds `0000_init` pending, makes the backup branch, migrates, builds.
6. **Locally:** copy `.env.example` to `.env.local`, fill in the same names, `npm run dev`.

## Local and cloud development

- `npm run dev` on port 3000 against `DATABASE_URL`. For work that must not touch production, point `DATABASE_URL` at a
  Neon branch made for the task, or run with no database: pages then fail loudly (`src/db/target.ts`), never pretend.
- Cloud sessions: `DB_DRIVER=neon-ws` plus `DATABASE_URL`.
- Tests never touch Neon: migrations and queries run on PGlite in memory.
