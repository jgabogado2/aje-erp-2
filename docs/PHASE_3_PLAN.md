# Phase 3 — Tracker Views Implementation Plan

Handoff doc for building the staff-facing tracker views after Phase 2. Phase 2 created the data model, hierarchy editor, task engine, and per-task entry table. Phase 3 turns that foundation into the daily working surface: spreadsheet-style list views, Kanban, Calendar, and role-aware dashboards.

---

## Status Snapshot

| Phase | Status | Notes |
| ----- | ------ | ----- |
| 1 | Done | Auth, org/site/user foundation, RBAC, dashboard shell. |
| 2a | Done | Tracker categories, site trackers, holidays. |
| 2b | Code done | Sections, task lists, tasks, hierarchy editor. |
| 2c | Code done | Task engine, task entries, cutoff status updates. |
| 2d | Code done | Tracker Builder wizard + 3-level DnD. |
| 3a | Code done | Tracker entries data API + shared view model. |
| 3b | Code done | Spreadsheet List View foundation. |
| 3c | Code done | Frequency-specific List View polish foundation. |
| 3d | Code done | Kanban View. |
| 3e | Code done | Calendar View. |
| 3f | Code done | Dashboard summaries. |
| 3g | Deferred | Bulk update is intentionally left for a later polish pass. |

**Migration application state:**

- `001` auth: applied
- `002_hakda_foundation.sql`: applied
- `003_hakda_trackers.sql`: applied
- `004_hakda_hierarchy.sql`: written, may still need application
- `005_hakda_entries.sql`: written, may still need application after `004`

Do not begin live manual testing for Phase 3 until `004` and `005` are applied.

Verification queries after applying migrations:

```sql
SELECT count(*) FROM tracker_sections;
SELECT count(*) FROM task_lists;
SELECT count(*) FROM tasks;
SELECT count(*) FROM task_entries;
```

---

## Decisions Already Locked

Use these. Do not re-deliberate unless the user explicitly changes direction.

1. **Stack:** Next.js 16 + React 19, Supabase SQL migrations and `supabase-js`, NextAuth, Tailwind v4, shadcn-style UI, TanStack Query, RHF + Zod, `@dnd-kit/*`, date-fns, recharts, react-big-calendar.
2. **No Prisma:** Supabase Postgres + SQL migrations are the source of truth.
3. **Tenant boundary:** Organization → Sites. AJE org is `00000000-0000-0000-0000-000000000001`.
4. **Roles:** `SUPER_ADMIN | SITE_MANAGER | STAFF`; backend RBAC stays mandatory.
5. **Year scope:** `site_trackers` are per-year. Phase 3 views are year-scoped by default.
6. **Task entries:** `task_entries` are the working rows/cells. Phase 3 must not compute pseudo entries client-side.
7. **Cutoff:** Server applies cutoff on entry status mutation. UI only reflects the returned entry.
8. **Status writes:** Continue using `PATCH /api/task-entries/[id]` for single-entry updates.
9. **BIR hybrid:** BIR has 12 monthly entries + 4 quarterly entries, with labels `January`...`December` and `1Q`...`4Q`.
10. **RLS:** Service-role-only policies. Browser goes through `/api/*`.
11. **Response envelope:** Every route returns `{ data, error, message }`.
12. **Phase 3 order:** Build List View first. Kanban, Calendar, Dashboard consume the same data and helpers.

---

## Decisions To Confirm Before Implementation

These are the only open Phase 3 decisions worth asking about if the user is present. If not, use the recommendation.

1. **Default tracker page tab**
   - Recommendation: default to **List** for all users, with **Manage** visible only to Super Admin / Site Manager.
   - Existing `/sites/[siteId]/trackers/[trackerId]/page.tsx` is currently the hierarchy editor. Convert it to a tabbed tracker workspace.

2. **Bulk actions**
   - Recommendation: defer true multi-cell selection/bulk update to late Phase 3 or Phase 4 polish.
   - Ship single-cell updates first because they cover the core workflow and use existing server cutoff logic.

3. **Daily tracker width**
   - Recommendation: support full-year daily columns with horizontal virtualization from the start.
   - Avoid rendering 365 columns × many tasks without virtualization.

4. **Dashboard placement**
   - Recommendation: enhance existing `app/(dashboard)/page.tsx` for global/current-user summary, and add tracker-local summary cards inside the tracker workspace.

5. **BIR row model**
   - Recommendation for Phase 3: one row per task, one column per period label. Use `bir_status` as the displayed status for BIR cells, with standard `status` still available for completion logic.
   - More specialized sub-row layouts like `TRRC Date`, `Payment Date`, and `Esubmission` can come in Phase 4/5 unless the user explicitly prioritizes BIR.

---

## Phase 3a — Tracker Entries Data Contract ✅

Goal: one efficient endpoint and shared transformation layer that every view can reuse.

### 3a.1 API: Tracker Entries

Add:

```text
app/api/site-trackers/[id]/entries/route.ts
```

`GET /api/site-trackers/[id]/entries?year=2026&assignee=...&status=...`

Return:

```ts
{
  site_tracker: SiteTracker & {
    tracker_category: TrackerCategory;
    site: Pick<Site, 'id' | 'code' | 'name' | 'organization_id'>;
  };
  sections: TrackerSection[];
  task_lists: TaskList[];
  tasks: TaskWithAssignee[];
  entries: TaskEntry[];
  summary: {
    total: number;
    not_done: number;
    ongoing: number;
    done: number;
    done_late: number;
    overdue: number;
    completion_rate: number;
  };
}
```

Rules:

- Visible to anyone with site access.
- Filters are optional and server-side where cheap.
- Do not expose entries outside the owning site.
- Use existing `siteIdForSiteTracker` + `canReadAtSite`.
- Order by hierarchy display order, then period date.

### 3a.2 Validation

Add:

```text
lib/validations/tracker-view.ts
```

Schemas:

- `trackerEntriesQuerySchema`
- `bulkTaskEntryUpdateSchema` only if bulk update is included.

### 3a.3 Hook

Add:

```text
hooks/use-tracker-entries.ts
```

Exports:

- `useTrackerEntries(siteTrackerId, filters)`
- reuse `useUpdateTaskEntry` from `hooks/use-task-entries.ts`

Query key:

```ts
['site-trackers', siteTrackerId, 'entries', filters]
```

### 3a.4 Shared View Model

Add:

```text
lib/tracker-view.ts
```

Pure helpers:

- `buildPeriodColumns(frequency, entries, year)`
- `groupTrackerRows(sections, taskLists, tasks, entries)`
- `entryKey(taskId, periodLabel)` or `entryKey(taskId, entryId)`
- `calculateColumnCompleteness(entries)`
- `calculateTaskCompleteness(entries)`
- `isEntryOverdue(entry, now)`
- `statusTone(status)`
- `birStatusTone(birStatus)`

Keep this file UI-free and DB-free.

---

## Phase 3b — Spreadsheet List View Foundation ✅

Goal: one reusable, virtualized tracker table that can render all frequencies.

### 3b.1 Workspace Tabs

Convert tracker detail route into a workspace:

```text
app/(dashboard)/sites/[siteId]/trackers/[trackerId]/page.tsx
```

Tabs:

- `List` — default
- `Kanban`
- `Calendar`
- `Manage` — existing hierarchy editor, write roles only

Implementation options:

- Keep current hierarchy editor code in the page temporarily but extract it to `components/sites/tracker-manage-view.tsx`.
- Add `components/tracker-views/tracker-workspace-tabs.tsx`.
- Use local state first; URL query `?view=list` can be added once stable.

### 3b.2 Components

Add:

```text
components/tracker-views/
  tracker-list-view.tsx
  tracker-grid.tsx
  tracker-grid-cell.tsx
  tracker-grid-header.tsx
  tracker-grid-row-label.tsx
  tracker-status-select.tsx
  tracker-view-toolbar.tsx
  tracker-summary-cards.tsx
```

Requirements:

- Sticky task/name column.
- Sticky period header.
- Horizontal virtualization for period columns with `@tanstack/react-virtual`.
- Vertical virtualization for rows if row count grows.
- Cells are stable-size buttons/selects; no layout shift on status changes.
- Use optimistic update through TanStack Query, but reconcile with server response because cutoff may change `DONE` to `DONE_LATE`.

### 3b.3 Toolbar

Filters:

- Assignee
- Status
- Task list
- Search by task name
- Optional: due/overdue toggle

Actions:

- Refresh
- Manage tracker, visible only to Super Admin / Site Manager

### 3b.4 Cell Behavior

Each cell should support:

- Standard status dropdown: `NOT_DONE`, `ONGOING`, `DONE`, `DONE_LATE`
- Submission date edit for weekly/monthly/BIR where relevant
- Note edit from a lightweight popover/dialog
- BIR status dropdown when tracker/task frequency is `BIR`

Server remains authoritative for:

- cutoff conversion
- `marked_by`
- `marked_at`

---

## Phase 3c — Frequency-Specific List Views ✅

Goal: make the generic grid feel correct for each tracker type.

### 3c.1 Daily

Columns:

- One column per generated daily entry date.
- Header format: `Jan 1`, `Jan 2`, etc.
- Group rows by Section → Task List → Task.
- Show daily column completeness.

Performance:

- Full-year daily grid must use horizontal virtualization.
- Keep first column width fixed.

Smoke test:

- Daily task with weekends skipped should not show weekend cells for that task.

### 3c.2 Weekly

Columns:

- Week labels from generated entries: `Week 1 (Mon DD)`.
- Header should include covered period and due date if space allows.
- Cell should expose submission date.

Smoke test:

- Verify 52/53 generated columns depending on year shape.
- Mark a past-due weekly entry `DONE`; server returns `DONE_LATE`.

### 3c.3 Monthly

Columns:

- January through December.
- Header includes due date/completeness.
- Cell exposes submission date and note.

Smoke test:

- 12 columns, one per month.

### 3c.4 Quarterly / Annual

Columns:

- Quarter labels for quarterly tasks.
- Annual tasks should display in annual/year-end column.
- Use task frequency override, not only tracker category frequency.

Smoke test:

- A quarterly task renders 4 entries; annual task renders 1 entry.

### 3c.5 BIR

Columns:

```text
Jan, Feb, 1Q, Apr, May, 2Q, Jul, Aug, 3Q, Oct, Nov, 4Q
```

Behavior:

- Cell primary state should be `bir_status`.
- Standard `status` still tracks completion and cutoff.
- Quarter columns use labels `1Q`...`4Q`.

Smoke test:

- BIR task renders 12 entries (8 monthly + 4 quarterly).
- The BIR order is exactly monthly-monthly-quarter repeated four times.

---

## Phase 3d — Kanban View ✅

Goal: card-based operational view for active work.

### Components

Add:

```text
components/tracker-views/kanban/
  tracker-kanban-view.tsx
  kanban-column.tsx
  kanban-entry-card.tsx
```

Columns:

- Not Done
- Ongoing
- Done
- Done Late

Data:

- Use same `useTrackerEntries` payload.
- Cards are task entries, not tasks.

Card content:

- Task name
- Period label
- Due date
- Assignee
- Task list / section
- BIR status badge if applicable

Drag behavior:

- Drag card between columns → `PATCH /api/task-entries/[id]`.
- Dropping into Done may return Done Late; UI must show returned status.
- Do not allow dragging into Done Late directly unless the server returns it. A Done Late column can accept cards as `DONE`, but the returned status decides final placement.

Filters:

- Assignee
- Period/date range
- Task list

---

## Phase 3e — Calendar View ✅

Goal: deadline-oriented view using `react-big-calendar`.

### Components

Add:

```text
components/tracker-views/calendar/
  tracker-calendar-view.tsx
  calendar-entry-dialog.tsx
```

Calendar event mapping:

- `start` / `end`: `due_date`
- title: task name + period label
- color: status tone

Interactions:

- Click event opens entry detail dialog.
- Dialog can update status, submission date, note, BIR status.
- Month/week/agenda modes.

Filters:

- Assignee
- Status
- Task list

Timezone:

- Display dates in Asia/Manila.
- Date-only DB values should not shift across timezones in UI.

---

## Phase 3f — Dashboard Summaries ✅

Goal: role-aware summary cards and charts.

### 3f.1 API

Add:

```text
app/api/dashboard/summary/route.ts
```

Query:

```text
GET /api/dashboard/summary?site_id=...&year=2026
```

Rules:

- Super Admin can view all sites in org or a selected site.
- Site Manager sees assigned sites.
- Staff sees assigned entries/tasks only.

Return:

```ts
{
  sites_count: number;
  users_count: number;
  entries_total: number;
  overdue_count: number;
  due_next_7_days: number;
  completion_rate: number;
  by_status: Array<{ status: TaskStatus; count: number }>;
  by_site: Array<{ site_id: string; site_name: string; completion_rate: number }>;
  by_assignee: Array<{ user_id: string; name: string; overdue_count: number; completion_rate: number }>;
}
```

### 3f.2 UI

Enhance:

```text
app/(dashboard)/page.tsx
```

Components:

```text
components/dashboard/
  dashboard-summary-cards.tsx
  overdue-list.tsx
  upcoming-deadlines.tsx
  completion-chart.tsx
  assignee-breakdown.tsx
```

Role layouts:

- **Super Admin:** org-wide completion, overdue, site comparison, active sites/users.
- **Site Manager:** assigned-site completion, overdue, upcoming deadlines, assignee breakdown.
- **Staff:** my tasks today, my overdue entries, my completion rate, quick mark done.

---

## Phase 3g — Optional Bulk Update

Only build after single-cell List View is stable.

Add:

```text
app/api/task-entries/bulk/route.ts
```

Body:

```ts
{
  entry_ids: string[];
  patch: {
    status?: TaskStatus;
    submission_date?: string | null;
    note?: string | null;
    bir_status?: BirStatus | null;
  };
}
```

Rules:

- Validate every entry belongs to a site the caller can access.
- Server applies cutoff per entry.
- Return updated entries.

UI:

- Multi-select cells.
- Bulk status toolbar.
- Keep this out of the first List View pass if it slows shipping.

Status: deferred. Single-entry status/date/note updates are implemented first.

---

## Implementation Notes

- `GET /api/site-trackers/[id]/entries` now returns tracker hierarchy, entries, and summary counts.
- `lib/tracker-view.ts` contains shared row/column grouping, summary, overdue, and tone helpers.
- Tracker detail page now defaults to a tabbed workspace: List, Kanban, Calendar, and Manage.
- Manage remains visible only to write roles.
- List view renders task rows against period columns and supports standard status, BIR status, submission date, and note edits.
- Kanban cards are task entries and update status through `PATCH /api/task-entries/[id]`.
- Calendar view renders due-date cells and opens an entry dialog for status updates.
- `GET /api/dashboard/summary` powers role-aware dashboard summary cards and upcoming/overdue lists.
- Phase 3 uses existing server-side cutoff logic; UI reconciles from returned entries.

---

## File Map

Likely new files:

```text
app/api/
  site-trackers/[id]/entries/route.ts       ✅ Phase 3a
  dashboard/summary/route.ts                ✅ Phase 3f
  task-entries/bulk/route.ts                Optional Phase 3g

components/
  tracker-views/
    tracker-list-view.tsx                   ✅ Phase 3b
    tracker-status-select.tsx               ✅ Phase 3b
    tracker-view-toolbar.tsx                ✅ Phase 3b
    tracker-summary-cards.tsx               ✅ Phase 3b
    kanban/                                 ✅ Phase 3d
    calendar/                               ✅ Phase 3e
  dashboard/
    dashboard-summary-cards.tsx             folded into dashboard page for first pass
    overdue-list.tsx                        folded into dashboard page for first pass
    upcoming-deadlines.tsx                  folded into dashboard page for first pass
    completion-chart.tsx                    deferred polish

hooks/
  use-tracker-entries.ts                    ✅ Phase 3a
  use-dashboard-summary.ts                  ✅ Phase 3f

lib/
  tracker-view.ts                           ✅ Phase 3a
  validations/tracker-view.ts               ✅ Phase 3a
  validations/dashboard.ts                  ✅ Phase 3f

types/
  domain.ts                                 Extend with Phase 3 payload types
```

Likely changed files:

```text
app/(dashboard)/sites/[siteId]/trackers/[trackerId]/page.tsx
  Convert to workspace tabs; keep Manage tab for Phase 2 hierarchy editor.

app/(dashboard)/page.tsx
  Replace placeholder dashboard with role-aware summaries.

hooks/use-task-entries.ts
  Reuse/update query cache after cell edits.
```

---

## Verification Plan

Always run:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Manual smoke tests:

1. **Migration check:** `task_entries` table exists and has rows after creating a task.
2. **Daily List:** create DAILY task with skip weekends; verify columns/cells match generated entries.
3. **Weekly List:** verify week labels, due dates, and submission date edits.
4. **Monthly List:** verify 12 month columns and completion summary.
5. **BIR List:** verify 12 columns in exact BIR order and BIR status dropdown works.
6. **Cutoff:** mark a past-due entry Done; UI reflects server-returned Done Late.
7. **Kanban:** drag entry from Not Done to Done; cutoff still applies.
8. **Calendar:** due-date event opens dialog and updates entry.
9. **RBAC:** Staff can update entries but cannot see Manage tab or structural edit actions.
10. **Dashboard:** Super Admin, Site Manager, and Staff see different scoped summaries.

---

## Re-Entry Checklist

1. Read this file and `docs/HAKDA_SUPER_PROMPT.md`.
2. Confirm migrations `004` and `005` are applied.
3. Run `npx tsc --noEmit && npm run build`.
4. Start with Phase 3a unless already complete.
5. Keep List View first. Kanban/Calendar/Dashboard should reuse the same data API and view helpers.
