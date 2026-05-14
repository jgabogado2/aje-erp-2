# E2E tests

Playwright specs for the critical flows. **Not yet runnable in CI** — they need
a live app + a test Supabase project + a way to inject an authenticated
session. This README documents the setup so whoever picks up Phase 5a.3 isn't
starting cold.

## Why these aren't wired into CI yet

`docs/PHASE_5_PLAN.md` 5a.3 lists five flows. All of them require:

1. A running Next.js server (`pnpm build && pnpm start`, or a Vercel preview URL).
2. A Supabase project with the migrations applied and at least one seeded org.
3. **Auth.** The app uses Google OAuth via NextAuth — Playwright can't click
   through a real Google login. The standard workaround is to inject a NextAuth
   session cookie directly:
   - Generate a valid JWT signed with `AUTH_SECRET` for a known test user.
   - `context.addCookies([{ name: 'next-auth.session-token', value: <jwt>, ... }])`
     before navigating.
   - Helper belongs in `tests/e2e/fixtures/auth.ts` once built.

## The five flows to cover (5a.3)

| Spec | Flow |
| --- | --- |
| `sign-in.spec.ts` | Authenticated session → dashboard renders with the right role view |
| `tracker-lifecycle.spec.ts` | SUPER_ADMIN: create site → create Monthly category → assign → land on workspace |
| `cutoff.spec.ts` | Mark an overdue entry DONE → server returns DONE_LATE → UI reflects it |
| `attachments.spec.ts` | Upload a PDF on the Calendar dialog → download → delete |
| `export.spec.ts` | Open tracker → Export → xlsx; assert Content-Type + non-zero body |

## Running locally once written

```bash
# 1. Start the app against a test Supabase project
NEXT_PUBLIC_SUPABASE_URL=... pnpm build && pnpm start

# 2. In another shell
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm test:e2e
```

`playwright.config.ts` already points at `PLAYWRIGHT_BASE_URL` (defaults to
`http://localhost:3000`).

## Status

- [x] `playwright.config.ts` committed
- [x] `example.spec.ts` — smoke test that the app responds (no auth)
- [ ] `fixtures/auth.ts` — session-cookie injection helper
- [ ] The five flow specs above
