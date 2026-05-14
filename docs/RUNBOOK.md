# Operations Runbook

Procedures for production incidents, deployments, and maintenance.

---

## Backups

**Supabase plan tier**: Check your plan at https://supabase.com/dashboard/project/<project-id>/settings/billing.
- Free / Pro: daily backups retained for 7 days (Pro) or none (Free).
- Team+: point-in-time recovery up to 7 days.

**Restore from backup**:
1. Go to Supabase dashboard → Settings → Backups.
2. Select the target restore point.
3. Click "Restore" — this spins up a new project; update env vars after.
4. Run `pnpm typecheck && pnpm build` against the new project URL to verify.

---

## Migrations

Migrations live in `supabase/migrations/` named `NNN_description.sql` (sequential).

**Apply a migration** (local dev):
```bash
supabase db push
```

**Apply to production**:
```bash
supabase db push --db-url "<prod_connection_string>"
```

**Rolling back a migration** — There are no committed `down` migrations, so rollbacks are manual. For each migration, the inverse operation is:
- `CREATE TABLE` → `DROP TABLE IF EXISTS <name>`
- `ALTER TABLE ADD COLUMN` → `ALTER TABLE DROP COLUMN <name>`
- `ALTER TABLE ADD CONSTRAINT` → `ALTER TABLE DROP CONSTRAINT <name>`

Run the inverse SQL in the Supabase SQL editor. Always test in a branch first.

---

## Audit log retention

Org admins set retention via Settings → Audit log retention. The preference is stored in `organization_settings.audit_retention_days`.

**Manual purge** (run in SQL editor as service role):
```sql
DELETE FROM audit_log
WHERE organization_id = '<org_id>'
  AND created_at < NOW() - INTERVAL '90 days';
```

To automate, enable `pg_cron` on your Supabase project and add:
```sql
SELECT cron.schedule(
  'purge-audit-log',
  '0 2 * * *',   -- 2 AM daily
  $$
    DELETE FROM audit_log al
    USING organization_settings os
    WHERE al.organization_id = os.organization_id
      AND os.audit_retention_days IS NOT NULL
      AND al.created_at < NOW() - (os.audit_retention_days || ' days')::INTERVAL;
  $$
);
```

---

## Incident response

**Production is down / 5xx flood**:
1. Check Vercel logs: https://vercel.com/dashboard → Project → Functions
2. Check Supabase logs: https://supabase.com/dashboard/project/<id>/logs/postgres-logs
3. Check Sentry for stack traces (if configured via `SENTRY_DSN`).
4. If a bad migration caused it: rollback the migration (see above) and redeploy.

**Who to contact**:
- Primary on-call: set in your team's notification channel.

---

## Rate limits

Rate limits are enforced via Upstash Redis (configured by `UPSTASH_REDIS_REST_URL/TOKEN`).
- Write mutations: 60/min per user
- Attachment sign: 30/min per user
- Auth endpoints: 10/min per IP

If legitimate traffic is being rate-limited, adjust the numbers in `lib/api/rate-limit.ts` and redeploy.

---

## Environment variables

See `.env.example` for the full list with descriptions.

**Critical missing vars and their effect**:
| Variable | Effect if missing |
|---|---|
| `AUTH_SECRET` | NextAuth fails to sign sessions |
| `SUPABASE_SERVICE_ROLE_KEY` | All API routes return 500 |
| `NEXT_PUBLIC_SUPABASE_URL` | Client-side Supabase calls fail |
| `RESEND_API_KEY` | Email notifications silently fail |
| `UPSTASH_REDIS_REST_URL` | Rate limiting is silently skipped |
