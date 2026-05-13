# Phase 4 — Enhancements Plan

Handoff doc for Phase 4: Audit Log, Attachments, Reports/Export, and Notifications. Each sub-phase is independent and incrementally shippable. Decisions are locked from the planning conversation — use them; don't re-deliberate.

---

## Status Snapshot

| Phase | Status | Notes |
| ----- | ------ | ----- |
| 1 | Done | Auth, org/site/user, RBAC, dashboard shell. |
| 2a–2d | Done | Trackers, task items (formerly task_lists), subtasks (formerly tasks), task engine. |
| 3a–3f | Done | Entries data API, List/Kanban/Calendar views, dashboard summaries. |
| 4a | Done | Audit log (status changes + structural changes on trackers/sites/users). |
| 4b | Done | Attachments via Supabase Storage. |
| 4c | Done | Reports & Export — Excel (exceljs) + PDF (react-pdf). |
| 4d | Planned | Notifications — in-app (sonner + table) + Resend email, triggered by pg_cron. |

**Migration application state:**

- `002`–`007` applied. `006` (per-section unique task list names) and `007` (task-item promotion) were applied.
- `008`–`009` (Phase 4a/4b migrations) — written; apply in Supabase before using audit/attachments in a deployed environment.
- `4c` has no schema migration.

---

## Decisions Already Locked

1. **Audit scope**: status changes + structural changes on trackers/sites/users. Skip display-order reorders (noisy, low value).
2. **Attachments storage**: Supabase Storage. One bucket `tracker-attachments` with org/site/entry path prefixes.
3. **Export formats**: both Excel (exceljs, server-side) and PDF (react-pdf).
4. **Notifications trigger**: Supabase pg_cron + Edge Function daily scan.
5. **Cross-cutting model rules** (carried over from earlier phases):
   - All API routes return `{ data, error, message }`.
   - RLS service-role-only; API layer is the security boundary.
   - `lib/auth.types.ts` is the single source for `SystemRole` / `SiteRole`.
   - `task_lists` is "task item" in the UI; `tasks` is "subtask".

---

## Phase 4a — Audit Log

The cross-cutting feature. Build first so subsequent mutations can write audit rows from day one.

### 4a.1 — Migration `008_audit_log.sql`

```sql
CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id       UUID REFERENCES sites(id) ON DELETE SET NULL,
  entity_type   TEXT NOT NULL,             -- 'task_entry' | 'site' | 'user' | 'tracker_category' | 'site_tracker' | 'task_list' | 'task'
  entity_id     UUID NOT NULL,
  action        TEXT NOT NULL,             -- 'create' | 'update' | 'delete' | 'status_change'
  old_value     JSONB,
  new_value     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_org_created    ON audit_log(organization_id, created_at DESC);
CREATE INDEX idx_audit_log_site_created   ON audit_log(site_id, created_at DESC);
CREATE INDEX idx_audit_log_entity         ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_user           ON audit_log(user_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_service_role_only" ON audit_log FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
```

### 4a.2 — `lib/api/audit.ts`

Single helper used by every mutation route. Designed so adding it to an existing handler is a single line.

```ts
export async function recordAudit(
  supabase: SupabaseAdmin,
  caller: ApiCaller,
  event: {
    entity_type: AuditEntityType;
    entity_id: string;
    action: AuditAction;
    old_value?: unknown;
    new_value?: unknown;
    site_id?: string | null;
  }
): Promise<void>;
```

Implementation notes:
- Never throws. Audit write failures must not break the user's request (log + swallow).
- Diffs `old_value` / `new_value` to only the changed fields server-side to keep rows small.
- For `task_entry` status changes, sets `action: 'status_change'` and includes both old and new status, marked_by, marked_at.

### 4a.3 — Wire into existing routes

Touch each route in `app/api/**` that mutates one of the audited entity types. The work is mechanical: `await recordAudit(...)` after the success branch.

Routes to wire:
- `task-entries/[id]` PATCH — status_change
- `sites/route.ts` + `sites/[id]/route.ts` — create/update/delete
- `users/route.ts` + `users/[id]/route.ts` — create/update/deactivate
- `tracker-categories/route.ts` + `tracker-categories/[id]/route.ts` — create/update/delete
- `sites/[id]/trackers/route.ts` + `sites/[id]/trackers/[trackerId]/route.ts` — assign/unassign
- `site-trackers/[id]/task-lists/route.ts` + `task-lists/[id]/route.ts` — task-item CRUD
- `task-lists/[id]/tasks/route.ts` + `tasks/[id]/route.ts` — subtask CRUD
- `sections/[id]/route.ts` + `site-trackers/[id]/sections/route.ts` — section CRUD

Skip reorder routes (display_order changes are noisy and low-value).

### 4a.4 — Viewer API + UI

- `GET /api/audit-log?site_id=&entity_type=&user_id=&from=&to=&cursor=`
- Cursor-paginated (`created_at` + `id`) so we don't load the world.
- Filter combinations server-validated; only org-scoped data returned.

UI: two routes.
- `/admin/audit` — SUPER_ADMIN only. Org-wide log with filter chips: entity type, user, site, date range.
- `/sites/[siteId]/audit` — SUPER_ADMIN + SITE_MANAGER. Scoped to that site.

Components: `components/audit/audit-table.tsx`, `components/audit/audit-filters.tsx`. Each row is collapsible to show old/new diff (JSONB → readable summary).

### 4a.5 — Verify 4a

Manual smoke: mark an entry DONE → row appears in audit; create a site → row appears; rename a task item → row appears with the field diff.

---

## Phase 4b — Attachments

Per HAKDA Prisma schema. Attachments live on task entries (per-period evidence).

### 4b.1 — Supabase Storage setup

Bucket name: `tracker-attachments`. Created via SQL or via the Supabase dashboard:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('tracker-attachments', 'tracker-attachments', false);
```

Object path convention: `{organization_id}/{site_id}/{task_entry_id}/{uuid}-{filename}`.

RLS: lock buckets to service-role only; signed URLs serve downloads. Uploads go through our API to get a presigned upload URL → client PUTs file to Supabase Storage directly → callback to register the row.

### 4b.2 — Migration `009_attachments.sql`

```sql
CREATE TABLE attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_entry_id UUID NOT NULL REFERENCES task_entries(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_size     INTEGER NOT NULL,
  mime_type     TEXT NOT NULL,
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_entry ON attachments(task_entry_id);
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attachments_service_role_only" ON attachments FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
```

### 4b.3 — API

- `POST /api/task-entries/[id]/attachments/sign` — returns `{ upload_url, storage_path }`. Validates entry access, MIME (allowlist: `pdf, jpg, jpeg, png, xlsx, csv, doc, docx`), size limit (10 MB).
- `POST /api/task-entries/[id]/attachments` — registers the row after the client has uploaded. Body: `{ storage_path, file_name, file_size, mime_type }`.
- `GET /api/task-entries/[id]/attachments` — list. Returns presigned download URLs (5-min TTL).
- `DELETE /api/attachments/[id]` — removes the row + storage object. Author or write-role at site.

### 4b.4 — Hooks + UI

- `hooks/use-attachments.ts` — `useAttachments(entryId)`, `useUploadAttachment(entryId)`, `useDeleteAttachment(entryId)`.
- UI: in the entry detail view (List view popover, Calendar dialog, per-task entries page), add a `<AttachmentList />` + `<AttachmentUploader />`.
- Drag-drop optional in Phase 4 polish; click-to-upload is the MVP.

### 4b.5 — Verify 4b

Upload a PDF, confirm download works, delete it, confirm 404 on the old URL.

---

## Phase 4c — Reports & Export

Self-contained. Reuses existing data hooks.

### 4c.1 — Excel export (`exceljs`, server-side)

`pnpm add exceljs`

Route: `GET /api/site-trackers/[id]/export.xlsx?year=2026&filters=...`

Layout:
- One worksheet per section.
- Headers: task item name, frequency, assignee, periods (matching the List view's columns).
- Cells: status text, colored fill matching `statusTone()`.
- Sticky first column + frozen header row.
- Footer summary: completion rate, overdue count.

### 4c.2 — PDF export (`@react-pdf/renderer`, server-side)

`pnpm add @react-pdf/renderer`

Route: `GET /api/site-trackers/[id]/export.pdf?year=2026&filters=...`

Layout:
- Cover page: site name, tracker name, year, summary stats.
- Body: one page per section, table of task items vs periods.
- Footer: generated-at timestamp, generated-by user.
- Landscape orientation for trackers with > 12 periods.

### 4c.3 — Dashboard export (org-wide)

`GET /api/dashboard/export.xlsx` and `.pdf` — uses the existing `useDashboardSummary` payload. Quick summary report; lower priority than the tracker export.

### 4c.4 — UI

- Tracker workspace toolbar: new "Export" dropdown next to filters with Excel / PDF options.
- Dashboard page: matching "Export summary" dropdown.
- Apply current filter state to the export URL so what you see is what you get.

### 4c.5 — Verify 4c

Generate Excel for a Monthly tracker — confirm 12 columns, correct status fills. Generate PDF — confirm pagination on a year-long Daily tracker.

---

## Phase 4d — Notifications

Last because of its surface area: cron + edge function + email vendor + in-app store + viewer page.

### 4d.1 — Migration `010_notifications.sql`

```sql
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id         UUID REFERENCES sites(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL,         -- 'overdue' | 'upcoming' | 'assigned' | 'status_changed'
  title           TEXT NOT NULL,
  body            TEXT,
  payload         JSONB,                 -- entry_id, task_list_id, etc.
  read_at         TIMESTAMPTZ,
  emailed_at      TIMESTAMPTZ,           -- non-null after Resend send
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_recent ON notifications(user_id, created_at DESC);
```

### 4d.2 — Resend integration

`pnpm add resend`

Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL=noreply@yourdomain.com`.

`lib/email.ts`:
- `sendOverdueEmail(user, entries)`
- `sendUpcomingEmail(user, entries)`
- Templates: plain HTML, no framework. Keep simple.

### 4d.3 — pg_cron + Edge Function

Create a Supabase Edge Function `notification-scan`:

1. Find entries where `due_date < CURRENT_DATE` and `status IN ('NOT_DONE', 'ONGOING')` and no recent "overdue" notification for this user+entry → insert one.
2. Find entries where `due_date = CURRENT_DATE + 1` → insert "upcoming" notification.
3. For each new notification, batch by user; send one Resend email per user with their day's digest.
4. Stamp `emailed_at` on sent rows.

Schedule via pg_cron (`pg_cron` extension needs to be enabled in the Supabase dashboard):

```sql
SELECT cron.schedule(
  'tracker-notifications-daily',
  '0 22 * * *',  -- 22:00 UTC = 6 AM Manila next day
  $$ SELECT net.http_post(...edge_function_url...) $$
);
```

### 4d.4 — In-app

- `hooks/use-notifications.ts`: `useUnreadCount()`, `useNotifications()`, `useMarkRead()`.
- Top-nav bell icon (already exists in `top-nav.tsx`!) renders the count.
- `/notifications` page lists recent notifications; each links to its target entry.
- `useUnreadCount` polls every 60 s while the tab is focused (TanStack Query default refetch).

### 4d.5 — Verify 4d

Make an entry due yesterday and run the edge function manually → confirm row inserted + email sent. Mark as read → confirm bell count decrements.

---

## File Map (likely paths)

```
supabase/migrations/
  008_audit_log.sql                     📝 4a
  009_attachments.sql                   📝 4b
  010_notifications.sql                 📝 4d

supabase/functions/
  notification-scan/index.ts            📝 4d (edge function)

lib/
  api/audit.ts                          📝 4a (server helper)
  email.ts                              📝 4d (Resend templates)

app/api/
  audit-log/route.ts                    📝 4a
  task-entries/[id]/attachments/route.ts            📝 4b
  task-entries/[id]/attachments/sign/route.ts       📝 4b
  attachments/[id]/route.ts                         📝 4b
  site-trackers/[id]/export.xlsx/route.ts           📝 4c
  site-trackers/[id]/export.pdf/route.ts            📝 4c
  notifications/route.ts                            📝 4d
  notifications/[id]/route.ts                       📝 4d

app/(dashboard)/
  admin/audit/page.tsx                  📝 4a
  sites/[siteId]/audit/page.tsx         📝 4a
  notifications/page.tsx                📝 4d

components/
  audit/                                📝 4a (table, filters, diff renderer)
  attachments/                          📝 4b (uploader, list)
  tracker-views/export-menu.tsx         📝 4c
  notifications/notification-bell.tsx   📝 4d
```

---

## Re-Entry Checklist

1. Read this file and `docs/PHASE_3_PLAN.md`.
2. Run `pnpm tsc --noEmit && pnpm build` to make sure you start from a green baseline.
3. Confirm migrations `002`–`007` are applied.
4. Pick the next sub-phase. Work in order — 4a first because audit-log gets wired across files that subsequent phases also touch.
5. Each sub-phase ends with a clear smoke test before moving on.

---

## Open Decisions (defer until each sub-phase)

These are not blocking the plan — each gets answered when its sub-phase starts:

- **4a**: Default audit retention period (90 days? Indefinite?). Default = indefinite; revisit if the table grows uncomfortably.
- **4b**: Max file size per attachment (default 10 MB). Allowed MIME types — default allowlist in plan, can expand.
- **4c**: PDF page orientation rule (default: portrait for trackers with ≤ 12 periods, landscape otherwise).
- **4d**: Notification preferences per user (digest vs immediate, mute by category). Default: every user gets the daily digest; preferences UI is a Phase 5 polish item.
