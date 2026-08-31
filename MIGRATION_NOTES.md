# Migration Notes — Directus → Supabase

> **Date:** 2026-08-31
> **Migration plan:** [`.hermes/plans/2026-08-30_000000-directus-to-supabase.md`](./.hermes/plans/2026-08-30_000000-directus-to-supabase.md)

The Shëlf backend moved from self-hosted Directus + PostgreSQL to managed
Supabase. This is a **fresh start** — no existing data was migrated.

## What changed for the production server

| Before                              | After                                   |
|-------------------------------------|-----------------------------------------|
| `directus` service in compose       | Removed                                 |
| `postgres` service in compose        | Removed (Supabase managed Postgres)     |
| `directus_uploads` / `directus_extensions` volumes | Removed                     |
| `DIRECTUS_URL` / `DIRECTUS_ADMIN_TOKEN` env vars | `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` |
| `DIRECTUS_PUBLIC_URL` / `DIRECTUS_SECRET` / `DIRECTUS_ADMIN_EMAIL` / `DIRECTUS_ADMIN_PASSWORD` / `POSTGRES_*` env vars | All removed        |
| `nginx` `/directus/` proxy block    | Removed                                 |
| `db:bootstrap` npm script           | `db:reset` + `db:types` (run locally)   |
| `bootstrap-directus.ts` / `bootstrap-restocking.ts` / `schema.json` | Deleted        |
| `@directus/sdk` dep                 | Removed                                 |
| `bcryptjs` + custom sessions        | Replaced with Supabase Auth (cookies)   |
| `pb.ts` + 5 stores using PocketBase  | Removed (dead code)                     |

## What stayed the same

- App still runs on the VPS (the SvelteKit container)
- Same `shelf` / `nginx` / `certbot` / `duckdns` containers
- Same DuckDNS domain
- Same SSL / Let's Encrypt flow

## Production deploy steps (new)

1. **Create the Supabase project**
   - https://supabase.com/dashboard → New project (free tier is fine)
   - Region: pick the closest to your VPS (e.g. Frankfurt for Europe, Singapore for Asia)
   - Save the database password somewhere safe (you'll need it for `psql` if you ever run migrations from the VPS)

2. **Push local migrations to the cloud project**
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   This applies `0001_init.sql` through `0005_storage_buckets.sql` to the cloud database.

3. **Get the three Supabase keys** from the project dashboard → Settings → API
   - `PUBLIC_SUPABASE_URL`     (Project URL)
   - `PUBLIC_SUPABASE_ANON_KEY`  (the new `sb_publishable_*` format)
   - `SUPABASE_SERVICE_ROLE_KEY` (the new `sb_secret_*` format)

4. **Update `.env.production`** on the VPS — remove all `DIRECTUS_*` and
   `POSTGRES_*` variables, add the three Supabase ones.

5. **Install the keepalive cron** to prevent free-tier pause (see below).

6. **Deploy** with `docker compose up -d --build` from the project dir.

## Keepalive (free tier)

Supabase free tier pauses after 7 days of inactivity. Install the keepalive
cron so the project stays awake:

```bash
sudo cp scripts/supabase-keepalive.sh /usr/local/bin/
sudo chmod 755 /usr/local/bin/supabase-keepalive.sh

sudo tee /etc/cron.d/supabase-keepalive <<'EOF'
CLOUD_SUPABASE_URL=https://<ref>.supabase.co
CLOUD_SUPABASE_ANON_KEY=sb_publishable_***
0 6 * * * root /usr/local/bin/supabase-keepalive.sh >> /var/log/supabase-keepalive.log 2>&1
EOF
```

The script hits `/auth/v1/health`, `/rest/v1/`, and `/storage/v1/bucket`
once per day. It no-ops silently if env vars are missing.

## Local development (unchanged)

```bash
# Start the local Supabase stack (postgres, postgrest, goTrue, etc.)
npx supabase start

# Apply migrations
npm run db:reset

# Regenerate types after a schema change
npm run db:types

# Run the app
npm run dev
```

The local stack is on `http://127.0.0.1:54321`; Studio on `:54323`.

## Things to clean up later

- The old `DEPLOYMENT.md` is mostly Directus-era and only partially correct.
  Consider rewriting it fully when you have a quiet hour.
- The `bootstrap-restocking.ts` was a one-time Directus setup script that's
  been removed. Same for `bootstrap-directus.ts` and `schema.json`.
- The `(app)/analytics/+page.server.ts` and the receive pages have a few
  implicit-`any` type warnings (20 total svelte-check errors). Runtime works
  but tightening those types is a good follow-up.

## Rollback plan

If something goes wrong, the old Directus image is still in your Docker
images cache (`directus/directus:11`). The migration was greenfield — no
data was moved over — so rollback is essentially "git revert the migration
commits and re-apply the old docker-compose + .env.production". Keep the
`supabase-keepalive` script + your cloud project around even after a
rollback, in case you want to re-attempt the migration.
