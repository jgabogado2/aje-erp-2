# Phase 2 — Implementation Plan

Handoff doc for picking up Phase 2 work across sessions. Status of each sub-phase, the chunked tasks remaining, and the decisions already locked so you don't re-deliberate.

---

## Status snapshot

| Phase | Status      | Notes                                                              |
| ----- | ----------- | ------------------------------------------------------------------ |
| 2a    | ✅ Done      | tracker_categories, site_trackers, holidays. Builder UI done.      |
| 2b    | ✅ Code done | sections, task_lists, tasks + hierarchy editor with arrow reorder. |
| 2c    | ✅ Code done | Task engine, task entries, status updates with cutoff.             |
| 2d    | ✅ Code done | Tracker Builder wizard polish + 3-level DnD in hierarchy editor.   |

**Migration application state:**

- `001` (auth) ✅ applied
- `002` (org/site/user_sites) ✅ applied
- `003` (categories, site_trackers, holidays) ✅ applied
- `004` (sections, task_lists, tasks + `assign_tracker_to_site` RPC) ⚠️ **WRITTEN BUT NOT APPLIED** — apply before any Phase 2c work
- `005` (task_entries) ⚠️ **WRITTEN BUT NOT APPLIED** — apply after `004`

To apply 004: Supabase SQL Editor → paste `supabase/migrations/004_hakda_hierarchy.sql` → Run. Verify:

```sql
SELECT count(*) FROM tracker_sections;
SELECT count(*) FROM task_lists;
SELECT count(*) FROM tasks;
SELECT pg_get_functiondef('assign_tracker_to_site'::regproc);  -- should exist
```

---

## Decisions already locked (don't re-ask)

These were settled in earlier sessions. Use them.

1. **Stack:** Next.js 16 + React 19, Supabase (supabase-js + raw SQL migrations, NOT Prisma), NextAuth Google OAuth, Tailwind v4, shadcn/ui, TanStack Query, Zustand, RHF + Zod v4, `@dnd-kit/*`, sonner, date-fns, recharts, react-big-calendar.
2. **Multi-tenancy:** Organization = company (tenant boundary). Site = office under an org. AJE org has fixed UUID `00000000-0000-0000-0000-000000000001`, code `ORG-001`.
3. **Roles:** `SUPER_ADMIN | SITE_MANAGER | STAFF` (verbatim HAKDA). `lib/auth.types.ts` is the single source.
4. **Tracker templates:** JSON columns on `tracker_categories` (`section_templates`, `task_list_templates`). Sections required, names unique per category.
5. **Year scoping:** Per-year `site_trackers` row (HAKDA default). `UNIQUE(site_id, category_id, year)`.
6. **Entry generation:** Synchronous on task create. Batch insert. No background queue.
7. **Holidays:** Pre-seeded with PH 2026 + manual additions (admin UI deferred to Phase 5 polish if needed).
8. **Task.frequency:** Stored explicitly on each task; defaults to category frequency in UI but can override.
9. **RLS:** Service-role-only on every table. API layer (`getApiCaller`, `hierarchy-auth.ts`) is the security boundary.
10. **Response envelope:** Every `/api/*` returns `{ data, error, message }`. Helpers in `lib/api/response.ts`.
11. **Reorder API:** All hierarchy levels expose a `/reorder` endpoint taking `{ ordered_ids: string[] }`. UI is currently arrow buttons; DnD comes in 2d.
12. **Soft vs hard delete:** Sites/categories support both (PATCH `is_active` for soft, DELETE for hard). Sections/task-lists/tasks are hard delete only (RESTRICT/CASCADE cleans up children).

---

## Phase 2c — Task Engine & Entries

The whole point of the prior phases: turn tasks into per-period work items that staff actually check off.

### Decisions used in 2c implementation

- **Asia/Manila timezone for cutoff.** Cutoff comparisons use the Manila end-of-day converted to UTC. The Philippines has a fixed UTC+8 offset, so no extra `date-fns-tz` dependency was added.
- **Entry regeneration on task edit:** Frequency/skip-rule edits delete and regenerate future entries only, using today's Asia/Manila date. Past entries stay as audit history.
- **BIR hybrid frequency:** BIR generates 12 monthly + 4 quarterly entries per task per year. `periodLabel`: `"January"…"December"` for monthly, `"1Q"…"4Q"` for quarterly. Quarterly `periodDate` is the end-of-quarter month start.
- **BIR uniqueness note:** The `task_entries` idempotency constraint is `(task_id, period_date, period_label)`, because BIR monthly and quarterly rows can share a `period_date`.
- **Holiday matching:** `holidays` is org-scoped. Match by `date` exactly. Recurring holidays (`is_recurring = true`) match any year for the same month/day.

### 2c.1 — Migration: `task_entries` + indexes (~1 task file)

```
supabase/migrations/005_hakda_entries.sql
```

- `task_entries` table per HAKDA schema:
  - `id`, `task_id` (FK CASCADE), `period_date DATE`, `period_label TEXT`, `due_date DATE`, `submission_date DATE NULL`
  - `status TEXT CHECK (status IN ('NOT_DONE','ONGOING','DONE','DONE_LATE')) DEFAULT 'NOT_DONE'`
  - `bir_status TEXT CHECK (bir_status IN (...)) NULL` — only set for BIR-frequency tasks
  - `value TEXT NULL` — for date-typed fields like "TRRC Date"
  - `marked_by UUID REFERENCES users(id) ON DELETE SET NULL`, `marked_at TIMESTAMPTZ NULL`
  - `note TEXT NULL`
  - `created_at`, `updated_at` + trigger
- Indexes: `(task_id, period_date)`, `(task_id, status)`, `(period_date)` for calendar views
- `UNIQUE(task_id, period_date)` so re-generation is idempotent
- RLS service-role-only

### 2c.2 — `lib/task-engine.ts` (pure functions, no DB)

Pure, testable functions. No Supabase imports — the API route does the DB writes.

```ts
// Public API:
generateEntriesForTask(task, year, holidays): TaskEntryDraft[]
checkCutoff(entry, now): TaskStatus     // returns DONE_LATE if past cutoff
getCurrentPeriod(frequency, date): { periodDate, periodLabel } | null
```

Implementation notes per frequency:
- `DAILY`: iterate Jan 1 → Dec 31; respect `skip_weekends`, `skip_holidays`. `due_date = period_date`. `period_label = formatted date`.
- `WEEKLY`: 52–53 Monday-start weeks. `period_label = "Week N (Mon DD)"`. `due_date = week_end + 2 days` (Tuesday of next week per HAKDA).
- `MONTHLY`: 12 entries. `period_date = first of month`. `due_date = last of month`. `period_label = full month name`.
- `QUARTERLY`: 4 entries. `period_date = first day of quarter`. `due_date = last day of quarter`. `period_label = "1Q","2Q","3Q","4Q"`.
- `ANNUAL`: 1 entry. `due_date = year-end`.
- `BIR`: hybrid — 12 monthly + 4 quarterly. Quarterlies get distinguishable labels (`"1Q"` etc.).
- `CUSTOM`: skip generation; UI lets users create entries manually (Phase 5 enhancement; for 2c return `[]`).

Cutoff in `Asia/Manila`:

```ts
const cutoff = zonedTimeToUtc(`${dueDate} 23:59:59.999`, 'Asia/Manila');
return markedAt > cutoff ? 'DONE_LATE' : 'DONE';
```

Test plan: add `lib/__tests__/task-engine.test.ts` with vitest if time permits. At minimum, eyeball 12-month BIR output and a Daily task with `skip_weekends` + PH 2026 holidays.

### 2c.3 — Hook entry generation into task CRUD

- `POST /api/task-lists/[id]/tasks` (already exists): after insert, call engine, batch-insert entries. Wrap in a Postgres function `generate_task_entries(task_id, year)` so it's atomic with the task insert.
- `PATCH /api/tasks/[id]`: if `frequency`, `skip_weekends`, or `skip_holidays` changed, delete future entries (`period_date >= today`) and regenerate. Past entries untouched.
- `DELETE /api/tasks/[id]`: cascade already wipes entries.

Year scope: use the parent `site_tracker.year`. Resolve via the join chain `task → task_list → site_tracker.year`.

### 2c.4 — Task entry API

- `GET /api/tasks/[id]/entries?year=2026` — list entries for a task. Visible to anyone with site access.
- `PATCH /api/task-entries/[id]` — body: `{ status?, submission_date?, value?, note?, bir_status? }`. Any site member can write. **Server applies cutoff:** if `status: 'DONE'` is being set and `now > cutoff`, write `DONE_LATE` instead. Set `marked_by = caller.userId`, `marked_at = now`.
- `POST /api/tasks/[id]/regenerate?from=2026-05-12` (SA + SITE_MANAGER) — explicit regeneration if needed. Use sparingly.

### 2c.5 — TanStack Query hooks

- `hooks/use-task-entries.ts`: `useTaskEntries(taskId, year)`, `useUpdateTaskEntry()` (optimistic update — entry status is what users will click rapidly; perceived latency matters), `useRegenerateTaskEntries()`.

### 2c.6 — Minimal UI: per-task entry list

For Phase 2c, ship just a **simple table view** of entries for one task. The full List / Kanban / Calendar views are Phase 3.

Page: `/sites/[siteId]/trackers/[trackerId]/tasks/[taskId]`

- Column: period label, due date, status (dropdown), submission date (datepicker), note
- Status dropdown immediately PATCHes the entry. Cutoff is applied server-side; UI just reflects what comes back.
- BIR-frequency tasks show a second `bir_status` dropdown.

### 2c.7 — Verify 2c

`pnpm tsc --noEmit && pnpm build`. Manual smoke: create a DAILY task with `skip_weekends`, verify entry count matches working days in 2026. Create a BIR task, verify 16 entries (12 monthly + 4 quarterly). Mark something DONE after its due date, verify it auto-becomes DONE_LATE.

---

## Phase 2d — Polish

Two parallel pieces. Pick either first; they don't depend on each other.

### 2d.1 — Tracker Builder Wizard ✅

Current `tracker-form-dialog.tsx` is functional but a single dense form. HAKDA spec has a wizard.

- **Step 1:** Name + description + frequency
- **Step 2:** Sections (drag to reorder, same dnd-kit pattern as the row in `sortable-task-list-row.tsx`)
- **Step 3:** Task lists per section (nested DnD, cross-section drag allowed)
- **Step 4:** Review & save

Implementation: same Zod schema + form state, just a stepper component on top. Use a `useState<0|1|2|3>` for the active step. Validate per-step before allowing "Next". Keep the existing dialog as a fallback for power users? Probably no — replace.

### 2d.2 — Multi-level drag-and-drop in hierarchy editor ✅

Replace the arrow buttons in `/sites/[siteId]/trackers/[trackerId]/page.tsx` with DnD.

- Single `<DndContext>` at page root
- One `<SortableContext>` per "level" (sections list, task lists within each section, tasks within each task list)
- Cross-section drag for task lists: when a task list drops into another section's `SortableContext`, fire BOTH `PATCH /api/task-lists/[id]` (to update `tracker_section_id`) AND the reorder for the new section. Or detect in `onDragOver` and reassign optimistically.
- Cross-task-list drag for tasks: same pattern.

Reference: dnd-kit docs on multi-container sortable. The "best" pattern uses `closestCorners` + custom collision detection. Budget half a day for the cross-container case alone — it's the trickiest piece of the whole project so far.

Implementation notes:

- Tracker category form is now a 4-step wizard: Basics, Sections, Task lists, Review.
- Sections can be reordered with DnD in the wizard.
- Task lists can be reordered and moved across sections in the wizard.
- Site tracker hierarchy editor now uses DnD handles for sections, task lists, and tasks.
- Task lists can move between sections/ungrouped. Tasks can move between task lists.
- `PATCH /api/tasks/[id]` now accepts `task_list_id` with same-tracker validation so cross-list task DnD stays backend-enforced.

---

## File map (where things live)

```
supabase/migrations/
  001_auth.sql                            ✅ applied
  002_hakda_foundation.sql                ✅ applied
  003_hakda_trackers.sql                  ✅ applied
  004_hakda_hierarchy.sql                 ⚠️  WRITTEN, NOT APPLIED
  005_hakda_entries.sql                   ✅ written, not applied

lib/
  auth.types.ts                           SystemRole, SiteRole — SoT for roles
  tracker.types.ts                        Frequency, TaskStatus, BirStatus
  rbac.ts                                 site-scoped server gates
  api/auth.ts                             getApiCaller, listCallerSiteIds
  api/response.ts                         apiSuccess / apiError envelope
  api/hierarchy-auth.ts                   siteIdForX + canRead/canWrite at site
  task-engine.ts                          ✅ Phase 2c — pure logic
  validations/
    site.ts user.ts tracker.ts
    section.ts task-list.ts task.ts
    task-entry.ts                         ✅ Phase 2c

app/api/
  sites/ ...                              ✅ Phase 1 + 2a
  tracker-categories/ ...                 ✅ Phase 2a
  site-trackers/[id]/hierarchy            ✅ Phase 2b
  site-trackers/[id]/sections/ ...        ✅ Phase 2b
  sections/[id]                           ✅ Phase 2b
  site-trackers/[id]/task-lists/ ...      ✅ Phase 2b
  task-lists/[id]                         ✅ Phase 2b
  task-lists/[id]/tasks/ ...              ✅ Phase 2b
  tasks/[id]                              ✅ Phase 2b
  tasks/[id]/entries                      ✅ Phase 2c
  task-entries/[id]                       ✅ Phase 2c
  tasks/[id]/regenerate                   ✅ Phase 2c

app/(dashboard)/
  page.tsx settings/ admin/sites/ admin/users/ admin/trackers/
  sites/[siteId]/
    page.tsx                              ✅ Phase 2a
    trackers/[trackerId]/page.tsx         ✅ Phase 2d (hierarchical editor + DnD)
    trackers/[trackerId]/tasks/[taskId]   ✅ Phase 2c (entries view)

hooks/
  use-sites.ts use-users.ts
  use-tracker-categories.ts use-site-trackers.ts
  use-hierarchy.ts                        ✅ combined sections/lists/tasks hook
  use-task-entries.ts                     ✅ Phase 2c

components/
  admin/sites/                            site form dialog
  admin/trackers/                         tracker form dialog + sortable row
  admin/users/                            user + assign-sites dialogs
  sites/                                  assign-tracker, section/task-list/task form dialogs
  layout/                                 site-switcher etc.
```

---

## Re-entry checklist (for a new session)

1. `pnpm tsc --noEmit && pnpm build` — verify the codebase compiles cold.
2. Apply migration 004 if `tracker_sections` table doesn't exist (`SELECT 1 FROM tracker_sections LIMIT 0;`).
3. Read `lib/auth.types.ts`, `lib/api/response.ts`, `lib/api/hierarchy-auth.ts` to absorb the patterns the codebase uses.
4. Pick the next chunk from above (start with 2c.1 if nothing is in progress).
5. Each chunk is small enough to fit in one focused session: 1–2 files of code + a typecheck + commit.
