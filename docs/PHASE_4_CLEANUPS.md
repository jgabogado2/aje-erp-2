# Phase 4 — Punch list of cleanups

Small items spotted during the Phase 4 audit. None block Phase 5, but knock them out as time allows. Ordered roughly by smallest blast radius first; pick from anywhere.

---

## Status

| # | Item | Effort | Impact | Where it bites if skipped |
| --- | --- | --- | --- | --- |
| 1 | Migration naming drift | 5 min | Low | Mixed conventions confuse future migrations |
| 2 | Per-user notification preferences | Medium | Medium | Users can't mute notification kinds |
| 3 | List view + per-task attachments | Medium | Medium | Evidence uploads only reachable via Calendar |
| 4 | `test`/`test:e2e` scripts in `package.json` | 5 min | Low (gate for 5a) | No way to run tests yet |
| 5 | Seed example tracker categories | Small | Medium | Re-create 5 categories by hand on every reset |
| 6 | Holidays admin UI | Medium | Medium | PH 2027+ needs manual SQL each year |
| 7 | Install `@upstash/ratelimit` (deferred from Phase 1) | 5 min (gate for 5d) | Low alone | Folded into 5d |
| 8 | Wire top-nav search button (or remove it) | Small | Low | Dead UI confuses users |
| 9 | Dark mode persistence + SSR-safe init | Small | Low | FOUC on reload; preference forgotten |

---

## 1. Migration naming drift

**Symptom**

```
supabase/migrations/
  002_hakda_foundation.sql
  003_hakda_trackers.sql
  ...
  009_attachments.sql
  20260513171434_notifications.sql   ← different convention
```

**Fix**

Rename `20260513171434_notifications.sql` → `010_notifications.sql`. Stay with sequential numbering since 8 files already use it. Update `docs/PHASE_4_PLAN.md` if it still references the date-prefixed name.

If you ever do want to migrate to Supabase's date-prefix style, do it as one batch rename across all files (and update any docs that reference filenames).

**Verify**: `ls supabase/migrations/` — one consistent style.

---

## 2. Per-user notification preferences

**Symptom**

Every user receives every notification `kind`. No way to mute "upcoming" while keeping "overdue", no way to switch between digest and immediate.

**Sketch**

Two new pieces:

```sql
-- migration 011 (or wherever next): per-user preferences
CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- One JSONB column keeps the schema flexible without churn:
  -- { overdue: 'email' | 'in_app' | 'off', upcoming: ..., ... }
  channels JSONB NOT NULL DEFAULT
    '{"overdue":"email","upcoming":"email","assigned":"in_app","status_changed":"off"}'::jsonb,
  digest    TEXT NOT NULL DEFAULT 'daily' CHECK (digest IN ('immediate','daily','off')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Then:

- `GET /api/notifications/preferences` (own row, autocreate on first read)
- `PATCH /api/notifications/preferences`
- `/notifications/preferences` page with toggles
- Update the Edge Function to read preferences when batching emails

Defer to **Phase 5c**. Listed here so it isn't forgotten.

---

## 3. List view + per-task page attachments

**Symptom**

Attachments are only reachable from the Calendar view's entry-detail dialog. The List view cells are too small to embed a file panel, and the per-task entries page (`/sites/[siteId]/trackers/[trackerId]/tasks/[taskId]`) doesn't surface them at all.

**Sketch**

- **List view**: a small paperclip badge in each cell when `attachments.length > 0`. Click → popover with `AttachmentList` + `AttachmentUploader`.
- **Per-task page**: add an "Attachments" column or an expandable row revealing the same components.

Reuse the existing `AttachmentList` and `AttachmentUploader` components verbatim.

Defer to **Phase 5c**. Listed here so it isn't forgotten.

---

## 4. Add test scripts

**Why now**: Phase 5a is built on these.

```jsonc
// package.json
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

Then `pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom playwright @playwright/test`.

Add a minimal `vitest.config.ts` and `playwright.config.ts`. Actual tests happen in **5a**.

---

## 5. Seed example tracker categories

**Source**: HAKDA prompt lists five. They're concrete, useful, and saving them as a one-time seed unblocks every smoke test.

```sql
-- supabase/seeds/example_tracker_categories.sql (one-shot, not a migration)
INSERT INTO tracker_categories (organization_id, name, description, frequency, section_templates, task_list_templates, is_active, created_by)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'Daily Operations', 'Front-office daily compliance',
   'DAILY',
   '[{"name":"Operations","order":0}]'::jsonb,
   '[
     {"name":"Collection","order":0,"section":"Operations","frequency":"DAILY","skip_weekends":false,"skip_holidays":false},
     {"name":"Disbursement","order":1,"section":"Operations","frequency":"DAILY"},
     {"name":"Billing","order":2,"section":"Operations","frequency":"DAILY"},
     {"name":"Administrative","order":3,"section":"Operations","frequency":"DAILY"}
   ]'::jsonb,
   true, NULL),

  ('00000000-0000-0000-0000-000000000001',
   'Weekly Reports', 'Weekly submissions',
   'WEEKLY',
   '[{"name":"Submissions","order":0}]'::jsonb,
   '[
     {"name":"DCR","order":0,"section":"Submissions","frequency":"WEEKLY"},
     {"name":"NDS","order":1,"section":"Submissions","frequency":"WEEKLY"},
     {"name":"CPR","order":2,"section":"Submissions","frequency":"WEEKLY"}
   ]'::jsonb,
   true, NULL),

  -- Monthly FS Requirements, BIR Compliance, Quarter/Annual Filings...
  ;
```

Three options for delivery:

- **(a) SQL seed** — committed at `supabase/seeds/example_tracker_categories.sql`, run manually after a reset. Simplest.
- **(b) Admin "Seed examples" button** on `/admin/trackers` that POSTs through the API. Nicer UX, more code.
- **(c) Auto-seed on first sign-in** of a brand-new org. Most magic, most surprising.

Recommend (a). Defer the actual seed content to **Phase 5c**.

---

## 6. Holidays admin UI

**Why**: PH 2026 was seeded in migration 003. 2027 onward needs manual SQL.

**Sketch**

- `/admin/holidays` page — list, sorted by date.
- Add holiday form: date, name, `is_recurring` toggle.
- Edit + delete.
- "Import next year" button that copies all `is_recurring = true` rows to a new year with one click.

API:

- `GET /api/holidays?year=2027`
- `POST /api/holidays`
- `PATCH /api/holidays/[id]`
- `DELETE /api/holidays/[id]`
- Org-scoped throughout.

Defer to **Phase 5c**.

---

## 7. Install rate-limit lib

**Why now**: 5d depends on it, and you may want to install ahead of time so types resolve in PRs that touch routes.

```
pnpm add @upstash/ratelimit @upstash/redis
```

Actual wiring happens in **5d**. Env vars (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) are required at use-time, not install-time.

---

## 8. Top-nav search button

**Symptom**: Visible button, does nothing. Confusing.

**Two options**:

- **Remove it** for now. Single edit in `app/(dashboard)/layout.tsx` (the `onSearchClick` prop on `AppShell`).
- **Wire a Cmd+K modal** — Phase 5b material. Searches entries / task items / sites / users (SUPER_ADMIN scope). Use the existing `/api/audit-log`-style filter pattern for the query.

Defer the wiring to **5b**. The 1-minute removal is fine to land now if it's bothering anyone.

---

## 9. Dark mode persistence + SSR-safe init

**Symptom**

```ts
// top-nav.tsx
React.useEffect(() => {
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(isDark ? "dark" : "light");
  document.documentElement.classList.toggle("dark", isDark);
}, []);
```

Problems:

- Theme is re-detected on every mount; user's choice never persists.
- `document.documentElement.classList.toggle` runs on the client only → flash of light theme (FOUC) on every reload for dark-mode users.

**Fix** (lift to **5b**): use `next-themes`.

```
pnpm add next-themes
```

```tsx
// app/layout.tsx (or providers)
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  {children}
</ThemeProvider>
```

Then drop the manual `useState` + `matchMedia` in top-nav; call `useTheme()` from `next-themes` instead. Adds a small inline script that sets the class before React hydrates → no FOUC.

---

## Quick-win starter set

If you have 30 minutes and want a fast cleanup pass before Phase 5:

1. Rename migration 010 (item 1)
2. Add `test`, `test:e2e`, `typecheck` scripts (item 4)
3. `pnpm add -D vitest @testing-library/react @testing-library/jest-dom @playwright/test` (item 4)
4. `pnpm add @upstash/ratelimit @upstash/redis next-themes` (items 7 + 9 prep)
5. Remove the dead search button (item 8) if it's bugging you

Total: ~20 minutes, sets up everything Phase 5 needs.
