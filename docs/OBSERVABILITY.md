# Observability setup (Phase 5a.4)

Error tracking and log discipline. The code-side hooks are cheap; the parts
that need an account/DSN are documented here rather than installed blind.

## Error tracking — Sentry

Not installed yet because it needs a project DSN you create. When ready:

```bash
pnpm add @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

The wizard creates `sentry.client.config.ts`, `sentry.server.config.ts`,
`sentry.edge.config.ts`, and wraps `next.config.ts`. Then:

1. Add `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (client) to `.env`
   and to Vercel project env vars.
2. Add `SENTRY_AUTH_TOKEN` to CI so source maps upload on deploy.
3. Set `tracesSampleRate` low to start (0.1) — bump if you need more.

What it gives you immediately:

- Unhandled exceptions in route handlers (currently only `console.error`'d).
- Client-side React errors caught by the error boundaries added in 5b.3.
- Release tracking tied to each Vercel deploy.

## Server log discipline

Already mostly in place — `handleUnknownError` in `lib/api/response.ts`
logs before returning a 500, and `recordAudit` swallows + logs its own
failures. One sweep to do in 5a:

- Every API handler's `catch` should log enough to triage: the route, the
  caller's user id, and the entity id being acted on. Most do; a few older
  ones just `console.error(err)` with no context.
- Standardize on a prefix per subsystem (`[audit]`, `[notifications]`,
  `[export]`) so logs are greppable. `lib/api/audit.ts` already does this.

## What NOT to log

- Never log `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, `RESEND_API_KEY`,
  or full request bodies (they can contain notes/attachments metadata).
- Never log signed URLs — they're short-lived but still credentials.

## Health check

Consider a `GET /api/health` route (returns `{ ok: true }` + a cheap DB
ping) so uptime monitors and Vercel can probe liveness. One-file add;
slot into 5d if not done sooner.
