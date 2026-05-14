# Phase 5 — Production Polish Plan

Last phase before this is something you can put in front of staff who depend on it. Four sub-phases; each is independently shippable. Decisions defer to each sub-phase when its scope begins.

> The original HAKDA prompt's Phase 5 was a thin polish list (dark mode, mobile, loading, e2e). This plan keeps that work in **5b** but adds the production-readiness items the codebase actually needs.

---

## Status Snapshot

| Phase | Status | Notes |
| ----- | ------ | ----- |
| 1 | Done | Auth, org/site/user, RBAC, dashboard shell. |
| 2a–2d | Done | Trackers, task items, subtasks, task engine. |
| 3a–3f | Done | Entries data API, List / Kanban / Calendar, dashboard. |
| 4a–4d | Done | Audit log, attachments, reports/export, notifications. |
| Phase 4 cleanups | Pending | See `docs/PHASE_4_CLEANUPS.md` — folded into 5a–5d below. |
| 5a | Planned | Tests + observability — confidence to refactor. |
| 5b | Planned | UX polish — dark mode, mobile, loading, virtualization, search. |
| 5c | Planned | Admin & data polish — holidays UI, seeds, prefs, retention. |
| 5d | Planned | Hardening & deployment — rate limit, security headers, CI, docs. |

**Recommended ordering**

```
5a (confidence)  →  5b (UX)     →  5c (admin/data)  →  5d (hardening)
                 ↑
            every later refactor is safer with tests in place
```

If you'd rather feel "users think it's finished" before "I'm confident shipping," swap 5b and 5a.

---

## Decisions Already Locked

Carried over and unchanged from earlier phases. Don't re-deliberate:

1. Stack: Next.js 16 + React 19, Supabase (no Prisma), NextAuth, Tailwind 4, shadcn/ui, TanStack Query, RHF + Zod, `@dnd-kit/*`, sonner.
2. Multi-tenant boundary = organization. Site lives under it.
3. Roles: `SUPER_ADMIN | SITE_MANAGER | STAFF`.
4. RLS service-role-only; API layer is the security boundary.
5. Response envelope: `{ data, error, message }`.
6. UI vocabulary: `task_lists` → "task item", `tasks` → "subtask".

---

## Phase 5a — Confidence: tests + observability

**Goal**: stop relying on eyeballing diffs. Make refactors safe.

### 5a.1 Test tooling

Install (matches `docs/PHASE_4_CLEANUPS.md` item 4):

```
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @playwright/test playwright
```

Add scripts:

```jsonc
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

Config files: `vitest.config.ts` (React plugin, jsdom env), `playwright.config.ts` (chromium, baseURL `http://localhost:3000`).

### 5a.2 Unit tests for pure logic

Highest ROI first. These functions have zero external deps; tests catch real bugs.

| File | What to verify |
| --- | --- |
| `lib/task-engine.ts` | Every frequency × skip-rule combo. Especially: DAILY with `skip_weekends`+holiday matches Manila calendar; BIR generates 12 entries (8 monthly + 4 quarterly — quarter-closing months are owned by the quarter); cutoff returns `DONE_LATE` for `markedAt > Asia/Manila end-of-day`. |
| `lib/api/audit.ts` | `diffFields` strips volatile timestamps; equal objects produce no diff; partial objects on create/delete. |
| `lib/tracker-view.ts` | `buildPeriodColumns` BIR sequence is exactly Jan/Feb/1Q/.../Nov/4Q. `groupTrackerRows` carries subtasks correctly. |
| `lib/export/*` (if data loaders extract well) | Snapshot test on a fixture: render Excel rows, assert key cells. |

Target: `pnpm test` runs in < 5 s. Don't worry about coverage % yet; pick concrete behaviors.

### 5a.3 E2E for critical flows

Five flows, no more. Each gives a strong regression signal.

1. **Sign-in** — `/signin` → Google OAuth (Playwright with a test session cookie injection) → dashboard renders.
2. **Site + tracker lifecycle** — SUPER_ADMIN creates a site, creates a Monthly category with one section/task item, assigns to site, lands on workspace.
3. **Status update + cutoff** — mark an entry's status to `DONE` on an overdue period; expect `DONE_LATE` to come back.
4. **Attachment round-trip** — upload PDF on Calendar dialog, refresh, download, delete.
5. **Export** — open tracker → Export → Excel; assert response has correct Content-Type and file size > 0.

### 5a.4 Observability

- **Sentry** (or PostHog, or both) — capture unhandled API errors + client exceptions. SDK install + DSN env var. Source maps in build.
- **Server log discipline** — every API handler that returns 5xx writes a structured `console.error` with `route`, `caller_id`, `entity`. Already mostly there; do one sweep.

### 5a.5 CI

`.github/workflows/ci.yml`:

```yaml
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

Skip e2e in CI initially (needs a deployed preview). Add later when you wire Vercel preview URLs.

### 5a.6 Verify 5a

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green. Test files exist for every file listed in 5a.2. GH Actions runs on the first PR.

---

## Phase 5b — UX polish

**Goal**: the app feels finished to a non-developer.

### 5b.1 Dark mode, done right

`pnpm add next-themes`. Wrap app in `ThemeProvider attribute="class" defaultTheme="system" enableSystem`. Replace top-nav's manual `useState` + `matchMedia` with `useTheme()`. Add the no-FOUC script (next-themes does this automatically when configured correctly). Add a "System / Light / Dark" three-option toggle in Settings.

Audit every component for dark-class consistency — most shadcn primitives already handle it, but custom badges (`statusTone`, `birStatusTone`) need a once-over.

### 5b.2 Mobile responsiveness audit

Walk every route at 375 px wide:

- Sidebar must collapse behind a sheet (already exists as `MobileSidebar` — confirm it triggers).
- Top-nav: site switcher truncates correctly; user menu fits.
- Tracker workspace: tab bar scrolls horizontally; List view first column is sticky and remains usable; Kanban becomes a single column with status switcher.
- Calendar: switch to "agenda" mode on small screens (`react-big-calendar` supports it).
- All form dialogs: scroll instead of overflow.

Touch targets: every interactive element ≥ 44 × 44 px.

### 5b.3 Loading skeletons + error boundaries

Replace "Loading…" text on slow surfaces with shadcn `<Skeleton />`:

- Entries grid (skeleton matching row shape × ~10)
- Dashboard cards (skeleton card with the right dimensions)
- Audit table (5 skeleton rows)

Add `error.tsx` for each route group:

- `app/(dashboard)/error.tsx`
- `app/(dashboard)/admin/error.tsx`
- `app/(dashboard)/sites/[siteId]/error.tsx`

Each shows the error message + a "Retry" button that calls `reset()`.

### 5b.4 List view virtualization

`@tanstack/react-virtual` is installed but unused. Add to `tracker-list-view.tsx`:

- **Vertical** virtualization on rows (estimate row height 56 px).
- **Horizontal** virtualization on period columns — critical for Daily trackers with 365 columns × N rows.

Smoke test: a Daily tracker with `skip_weekends=false` for 250 task items × 365 days = 91,250 cells should render in < 200 ms.

### 5b.5 Top-nav search (Cmd+K)

Either wire it or remove it. If wiring:

- Dialog opens on Cmd+K / Ctrl+K and on the existing button click.
- Server search: `GET /api/search?q=...` returns entries (task name + period), task items, sites, users.
- Org-scoped; results filtered by what the caller can read.
- Group by entity type; keyboard navigable.

If removing: drop `onSearchClick` and the button.

### 5b.6 Verify 5b

Visual diff on a phone simulator. Lighthouse accessibility ≥ 95 on dashboard and tracker workspace. List view test in 5b.4 hits the < 200 ms target.

---

## Phase 5c — Admin & data polish

**Goal**: the bits a real org needs to operate the system without you holding their hand.

### 5c.1 Holidays admin UI

Page: `/admin/holidays`. List grouped by year, sorted by date. Add/edit dialog with date, name, `is_recurring`. Bulk action: "Copy recurring holidays to next year."

API:

- `GET /api/holidays?year=2027`
- `POST /api/holidays`
- `PATCH /api/holidays/[id]`
- `DELETE /api/holidays/[id]`

Audit-log the writes (use existing `recordAudit` with `entity_type='site'`? Add a new `'holiday'` entity type? — add new, one-line CHECK constraint update on `audit_log`).

### 5c.2 Notification preferences

Per `docs/PHASE_4_CLEANUPS.md` item 2. New table `notification_preferences`, two API routes, one page at `/notifications/preferences`. Update the Edge Function to consult preferences when batching emails.

### 5c.3 Audit retention

Add `audit_retention_days` to a new `organization_settings` table (or just `organizations`). Default `NULL` = keep forever. UI in Settings → Organization to choose 90 / 180 / 365 / forever.

pg_cron daily job: delete `audit_log` rows where `created_at < now() - INTERVAL retention_days` for orgs that have it set.

### 5c.4 Seed example tracker categories

One-shot SQL committed at `supabase/seeds/example_tracker_categories.sql`. The five HAKDA examples (Daily Operations, Weekly Reports, Monthly FS Requirements, BIR Compliance, Quarter/Annual Filings) with realistic section + task-item templates.

Optionally: a "Seed examples" button on `/admin/trackers` (SUPER_ADMIN only) that POSTs through `/api/tracker-categories` for each. Useful for clean orgs that don't want to run SQL.

### 5c.5 Attachments on List view + per-task page

Per `docs/PHASE_4_CLEANUPS.md` item 3.

- **List view cell**: paperclip badge with `n` count when `n > 0`. Click → popover with `<AttachmentList />` + `<AttachmentUploader />`.
- **Per-task page**: an "Attachments" column or expandable row with the same components.
- The paperclip count comes from a small map built on the existing `useTrackerEntries` payload — needs the entries endpoint to include `attachments_count` per entry. One SQL touch.

### 5c.6 Verify 5c

Holidays admin works end-to-end. Setting org retention to 90 days + waiting a day removes old audit rows in a dev env. Seed SQL produces 5 categories. List view shows paperclip on entries with attachments.

---

## Phase 5d — Hardening & deployment

**Goal**: safe to expose to the public internet.

### 5d.1 Rate limiting

`pnpm add @upstash/ratelimit @upstash/redis`. Env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

Create `lib/api/rate-limit.ts` with:

- `ratelimitWrite`: 60 req/min/user for any `POST/PATCH/DELETE`.
- `ratelimitUploadSign`: 30 req/min/user for the attachment-sign endpoint specifically (it's expensive).
- `ratelimitAuthGate`: 10 req/min/IP on `/signin` and `/api/auth/*` (mitigate credential-stuffing if you ever add password auth).

Wire as a single function called at the top of each mutation handler. Returns `apiError('rate_limited', ..., 429)` when over.

### 5d.2 Security headers

`next.config.ts` headers():

```ts
{
  source: '/(.*)',
  headers: [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    // CSP last — needs careful tuning. Start in report-only:
    { key: 'Content-Security-Policy-Report-Only', value: "default-src 'self'; img-src 'self' data: https://*.supabase.co; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ..." },
  ],
}
```

Spend an iteration tuning CSP. Resend, Supabase, Google OAuth all add domains. Once stable for a week in `Report-Only`, switch to `Content-Security-Policy`.

### 5d.3 Documentation: `.env.example`

Every variable currently in `.env.local`. Group by service. Include where to obtain each (Supabase dashboard URL, Google Cloud OAuth client URL, Resend API key page).

```env
# NextAuth
AUTH_SECRET=                 # `openssl rand -base64 32`
AUTH_GOOGLE_ID=              # https://console.cloud.google.com/apis/credentials
AUTH_GOOGLE_SECRET=
NEXTAUTH_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=    # Supabase dashboard → Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Resend
RESEND_API_KEY=              # https://resend.com/api-keys
RESEND_FROM_EMAIL=

# Upstash (Phase 5d.1)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Optional
SENTRY_DSN=                  # Phase 5a.4
```

### 5d.4 `vercel.json`

- `crons`: list of cron entries (or leave to Supabase pg_cron if that's the choice — re-confirm which path notifications run on after 4d).
- `regions`: pin if there's a latency reason (default Vercel IAD1 is fine).
- `headers`: only if you need overrides on top of `next.config.ts`.

### 5d.5 Migration naming cleanup

Per `docs/PHASE_4_CLEANUPS.md` item 1. Rename `20260513171434_notifications.sql` → `010_notifications.sql`. Update plan docs.

### 5d.6 `pnpm approve-builds`

Stop skipping `sharp` and `unrs-resolver` postinstall scripts so image optimization works in production:

```
pnpm approve-builds
```

Pick `sharp` (yes), `unrs-resolver` (yes — Next.js relies on it). Commit the resulting `package.json` change.

### 5d.7 Backup/DR documentation

`docs/RUNBOOK.md`:

- Which Supabase plan tier you're on and whether it includes daily backups.
- How to restore from a backup (Supabase docs link + your specific steps).
- How to roll back a bad migration (every `00X_*.sql` should have a "down" plan even if not committed as code).
- Who to page when production is down.

### 5d.8 Security review pass

Manual sweep, no new code unless a real bug is found:

- Every API handler asserts `caller.organizationId` matches the entity being touched.
- Audit log can't be mutated by any non-service-role caller (already RLS; double-check no API route is doing direct writes).
- Attachments storage paths can't be forged (the prefix check is there; confirm no route accepts an arbitrary `storage_path`).
- No service-role key reaches the browser bundle (`SUPABASE_SERVICE_ROLE_KEY` must not be `NEXT_PUBLIC_*`).
- Sign-out path clears NextAuth cookie + Supabase storage cache.

### 5d.9 Verify 5d

`pnpm build` clean. Rate-limit responses on 61st call. CSP in Report-Only doesn't break any page. Vercel preview deploys green. `.env.example` round-trips with a fresh checkout.

---

## File Map (likely paths)

```
docs/
  PHASE_4_CLEANUPS.md           ✅ written
  PHASE_5_PLAN.md               ✅ written
  RUNBOOK.md                    📝 5d.7

.github/workflows/
  ci.yml                        📝 5a.5

vitest.config.ts                📝 5a.1
playwright.config.ts            📝 5a.1
tests/
  unit/
    task-engine.test.ts         📝 5a.2
    audit-diff.test.ts          📝 5a.2
    tracker-view.test.ts        📝 5a.2
  e2e/
    sign-in.spec.ts             📝 5a.3
    tracker-lifecycle.spec.ts   📝 5a.3
    cutoff.spec.ts              📝 5a.3
    attachments.spec.ts         📝 5a.3
    export.spec.ts              📝 5a.3

lib/
  api/rate-limit.ts             📝 5d.1
  api/search.ts                 📝 5b.5 (if wired)

supabase/migrations/
  010_notifications.sql         📝 5d.5 (rename from date-prefixed)
  011_holiday_audit_type.sql    📝 5c.1 (extend audit CHECK)
  012_notification_preferences.sql  📝 5c.2
  013_organization_settings.sql 📝 5c.3 (or add to organizations)

supabase/seeds/
  example_tracker_categories.sql 📝 5c.4

app/api/
  search/route.ts               📝 5b.5
  holidays/route.ts             📝 5c.1
  holidays/[id]/route.ts        📝 5c.1
  notifications/preferences/route.ts  📝 5c.2

app/(dashboard)/
  admin/holidays/page.tsx       📝 5c.1
  notifications/preferences/page.tsx  📝 5c.2
  (dashboard)/error.tsx         📝 5b.3
  ...

components/
  search/command-palette.tsx    📝 5b.5
  skeletons/                    📝 5b.3

vercel.json                     📝 5d.4
.env.example                    📝 5d.3
```

---

## Re-Entry Checklist

1. Read this file and `docs/PHASE_4_CLEANUPS.md`.
2. Run `pnpm typecheck && pnpm lint && pnpm build` to confirm a green baseline.
3. Apply any pending migrations (`009`, `010`) if not already.
4. Pick the next sub-phase — start with 5a unless you have a specific UX deadline.
5. Each sub-phase ends with its own verify section before moving on.

---

## Open Decisions (defer until each sub-phase)

- **5a.4**: Sentry vs PostHog vs both? Default = Sentry only (errors). PostHog if you want product analytics later.
- **5b.5**: Cmd+K search — do or remove? Default = remove for now, revisit if users ask.
- **5c.2**: Email digest vs immediate — what's the default `digest` for new orgs? Default = `daily`. Per-user can opt out to `immediate` or `off`.
- **5c.3**: Default `audit_retention_days`? Default = `NULL` (forever). Orgs set their own.
- **5d.1**: Rate limits per route — exact numbers in 5d.1 are starting points; adjust after first week of real traffic.
- **5d.2**: CSP allowlist — finalize after running Report-Only for a few days.
