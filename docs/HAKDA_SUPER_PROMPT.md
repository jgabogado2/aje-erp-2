# HAKDA — SUPER PROMPT FOR AI CODING ASSISTANT

> Copy and paste this prompt into Codex, Claude Code, Cursor, or another coding assistant to continue building Hakda from the current repo state.

---

## 📋 PROJECT BRIEFING

You are an expert full-stack engineer tasked with building **Hakda**, a multi-site, role-based project management and compliance tracking web application for Philippine businesses managing recurring operational, accounting, and BIR (Bureau of Internal Revenue) tasks.

The name **Hakda** is Filipino for *"to plan / to prepare"*. The app replaces traditional Excel-based trackers with a centralized, role-aware web platform.

**Current state:** Authentication, Phase 1, Phase 2, and Phase 3 are implemented in code. Continue from Phase 4 unless the user explicitly asks for cleanup, migration application, or Phase 3 polish first.

---

## CURRENT IMPLEMENTATION STATUS

Last updated: 2026-05-12.

| Phase | Status | Notes |
| --- | --- | --- |
| Auth | Done | NextAuth Google OAuth already wired. |
| Phase 1 | Done | Organizations, sites, users, site assignments, RBAC, dashboard shell. |
| Phase 2a | Done | Tracker categories, site trackers, holidays, tracker assignment. |
| Phase 2b | Code done | Sections, task lists, tasks, hierarchy editor. |
| Phase 2c | Code done | Task engine, task entries, status updates with cutoff. |
| Phase 2d | Code done | Tracker Builder wizard and 3-level DnD hierarchy editor. |
| Phase 3 | Code done | Full List / Kanban / Calendar / Dashboard first pass. |
| Phase 4 | Next | Notifications, audit log, attachments, reports/export. |

Migration state:

- `001` auth: applied
- `002_hakda_foundation.sql`: applied
- `003_hakda_trackers.sql`: applied
- `004_hakda_hierarchy.sql`: written, may still need application
- `005_hakda_entries.sql`: written, may still need application after `004`

Before testing Phase 2b/2c live, verify `004` and `005` are applied in Supabase.

---

## 🎯 CORE REQUIREMENTS

### Tech Stack (Use these exactly)

- **Frontend:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, shadcn/ui-style components
- **Backend:** Next.js API routes
- **Database:** Supabase Postgres with raw SQL migrations and `@supabase/supabase-js`; **do not add Prisma**
- **Auth:** NextAuth Google OAuth
- **State Management:** Zustand for global state, TanStack Query (React Query) for server state
- **Forms:** React Hook Form + Zod validation
- **Drag & Drop:** `@dnd-kit/*`
- **Calendar:** react-big-calendar
- **Date utilities:** date-fns
- **Icons:** lucide-react
- **Charts:** recharts (for dashboards)
- **Notifications (in-app):** sonner (toasts)
- **File uploads:** Supabase Storage when attachments are built
- **Email:** Resend API when notifications are built

### Project Standards

- TypeScript strict mode enabled
- Folder structure: feature-based (not type-based)
- All API routes return consistent shape: `{ data, error, message }`
- All forms use React Hook Form + Zod schemas
- All dates stored as UTC in DB, displayed in Asia/Manila timezone
- Mobile-responsive (mobile-first approach)
- Dark mode support
- Loading states + skeleton screens everywhere
- Error boundaries on every route
- Optimistic UI updates where appropriate
- API routes use `getApiCaller`, `hierarchy-auth.ts`, and service-role Supabase access on the server.
- Public Supabase RLS policy is service-role-only for app tables; frontend access goes through `/api/*`.

---

## 👥 USER ROLES (RBAC)

Implement three roles with strict permission checks on BOTH frontend AND backend:

### 1. Super Admin
- Full system access
- Creates/edits/deletes tracker categories, sites, users
- Assigns tracker categories to sites
- Assigns users to sites
- Views all data across all sites
- Views global audit log

### 2. Site Manager
- Scoped to assigned site(s) only
- Can add task lists, tasks, and assign personnel within their site
- Can mark task status
- Can view audit log for their site
- Cannot create/edit other users, sites, or tracker categories

### 3. Staff
- Scoped to assigned site(s) only
- Can only mark task status (Done, Ongoing, Done Late)
- Read-only access to other data
- Cannot create or modify structural elements

**CRITICAL:** RBAC must be enforced on the backend via middleware. Never trust the frontend.

---

## 🏛 SYSTEM ARCHITECTURE

### Hierarchy

```
Super Admin
   ├── Tracker Categories (global templates)
   │     └── Frequencies: Daily, Weekly, Monthly, BIR, Quarter/Annual, Custom
   │
   ├── Users (system-wide, with role)
   │
   └── Sites (offices)
         ├── Assigned Tracker Categories → become "Site Trackers"
         │     └── Sections → Task Lists → Tasks → Task Entries
         │
         └── Assigned Users (with site-scoped role)
```

### Key Relationships

- Tracker Category ↔ Sites: many-to-many (via `site_trackers`)
- User ↔ Sites: many-to-many (via `user_sites`)
- Each Task belongs to a Task List, which belongs to a Site Tracker
- Each Task auto-generates Task Entries for the year based on frequency

---

## DATABASE MODEL

The implementation uses Supabase Postgres SQL migrations, not Prisma. Keep SQL in `supabase/migrations/` and shared TypeScript row shapes in `types/domain.ts`.

Implemented migrations:

```text
supabase/migrations/
  002_hakda_foundation.sql   organizations, users/org members, sites, user_sites
  003_hakda_trackers.sql     tracker_categories, site_trackers, holidays
  004_hakda_hierarchy.sql    tracker_sections, task_lists, tasks, assign RPC
  005_hakda_entries.sql      task_entries
```

Core tables:

- `organizations`: tenant boundary. AJE uses fixed UUID `00000000-0000-0000-0000-000000000001`.
- `users`: NextAuth user records.
- `organization_members`: system role per org: `SUPER_ADMIN | SITE_MANAGER | STAFF`.
- `sites`: offices under an organization.
- `user_sites`: many-to-many site assignments with site role.
- `tracker_categories`: reusable templates. Includes `frequency`, `section_templates`, and `task_list_templates`.
- `site_trackers`: per-site, per-year tracker instance. Unique on `(site_id, tracker_category_id, year)`.
- `tracker_sections`: section instances under a site tracker.
- `task_lists`: task-list instances under a site tracker and optional section.
- `tasks`: recurring task definition. Stores explicit frequency and skip rules.
- `task_entries`: generated per-period work items. Statuses: `NOT_DONE | ONGOING | DONE | DONE_LATE`; BIR statuses supported.
- `holidays`: org-scoped holiday source for skip-holiday generation.

Important schema decisions:

- RLS is enabled with service-role-only policies on app tables.
- Browser clients do not query Supabase tables directly; API routes use the server admin client.
- `task_entries` uniqueness is `(task_id, period_date, period_label)` because BIR monthly and quarterly entries can share a date.
- Sections/task-lists/tasks are hard deleted; site/category records support active/inactive soft delete.

---

## PROJECT STRUCTURE

```
hakda/
├── app/
│   ├── (dashboard)/
│   │   ├── page.tsx
│   │   ├── admin/sites/
│   │   ├── admin/users/
│   │   ├── admin/trackers/
│   │   ├── settings/
│   │   └── sites/[siteId]/
│   │       ├── page.tsx
│   │       └── trackers/[trackerId]/
│   │           ├── page.tsx
│   │           └── tasks/[taskId]/page.tsx
│   ├── api/
│   │   ├── sites/
│   │   ├── users/
│   │   ├── tracker-categories/
│   │   ├── site-trackers/
│   │   ├── sections/
│   │   ├── task-lists/
│   │   ├── tasks/
│   │   └── task-entries/
│   └── layout.tsx
├── components/
│   ├── ui/
│   ├── admin/
│   ├── sites/
│   ├── layout/
│   └── providers/
├── lib/
│   ├── api/
│   ├── validations/
│   ├── supabase.ts
│   ├── rbac.ts
│   ├── task-engine.ts
│   └── tracker.types.ts
├── hooks/
│   ├── use-sites.ts
│   ├── use-users.ts
│   ├── use-tracker-categories.ts
│   ├── use-site-trackers.ts
│   ├── use-hierarchy.ts
│   └── use-task-entries.ts
├── supabase/migrations/
├── stores/
└── types/
    ├── domain.ts
    └── next-auth.d.ts
```

---

## BUILD ORDER

### PHASE 1: Foundation — DONE

1. Supabase SQL foundation migrations.
2. RBAC helpers and API caller resolution.
3. Sites CRUD.
4. Users CRUD.
5. User-site assignment.
6. Admin pages for sites and users.

### PHASE 2: Tracker System — CODE DONE

7. Tracker Categories CRUD.
8. Assign Tracker to Site with `assign_tracker_to_site` RPC.
9. Sections / Task Lists CRUD.
10. Tasks CRUD.
11. Task Engine and generated task entries.
12. Tracker Builder wizard.
13. Hierarchy editor with multi-level DnD.

### PHASE 3: Views — CODE DONE

Build the full staff-facing tracker views on top of existing `task_entries`.

14. **List View** (Excel-like)
    - Sticky first column (task names)
    - Sticky header (date/period columns)
    - Click cell to update status
    - Inline status dropdown
    - Show completeness per column
15. **Tracker-specific List View variants:**
    - **Daily**: 365 date columns, grouped by Task List
    - **Weekly**: 49+ week columns, each with "Covered Period" + "Due Date" + "Submission Date"
    - **Monthly**: 12 month columns + Due Date / Submission Date / Completeness
    - **BIR**: Jan, Feb, **1Q**, Apr, May, **2Q**, Jul, Aug, **3Q**, Oct, Nov, **4Q** — sectioned (EWT Recon, Quarterly ITR), uses BIR-specific statuses
    - **Quarter/Annual**: City Hall section (rows = items, columns = Q1-Q4 dates) + Annual BIR Filings section
16. **Kanban View** (`@dnd-kit/core`)
    - Columns: Not Done / Ongoing / Done / Done Late
    - Drag cards to change status (respects cutoff)
17. **Calendar View** (`react-big-calendar`)
    - Plot due dates, color by status
    - Click date for tasks-of-day modal
18. **Dashboard** (role-specific)
    - Cards: completion rate, overdue, upcoming
    - Charts using recharts

### PHASE 4: Enhancements — NEXT

19. **Notifications** — in-app + email (Resend)
20. **Audit Log** — record all status changes, with viewer UI
21. **Attachments** — upload files per Task Entry
22. **Reports & Export** — PDF + Excel export

### PHASE 5: Polish

23. **Dark mode toggle**
24. **Mobile responsiveness**
25. **Loading states + error boundaries**
26. **End-to-end testing critical flows**

---

## ⚙️ TASK ENGINE LOGIC (CRITICAL)

This is already implemented in `lib/task-engine.ts` and wired through `lib/api/task-entry-generation.ts`.

When a Task is created, auto-generate TaskEntries based on frequency:

```typescript
function generateEntriesForTask(task, year) {
  const entries = [];
  switch (task.frequency) {
    case 'DAILY':
      // Generate 365 entries (skip weekends/holidays if configured)
      for each day in year:
        if (skipWeekends && isWeekend(day)) continue;
        if (skipHolidays && isHoliday(day)) continue;
        entries.push({ periodDate: day, periodLabel: day.toLocaleDateString(), dueDate: day });
      break;
    case 'WEEKLY':
      // Generate 52 entries, Monday to Sunday weeks
      for week 1 to 52:
        const coveredPeriod = `${weekStart} to ${weekEnd}`;
        const dueDate = weekEnd + 2 days; // Tuesday of following week
        entries.push({ periodDate: weekStart, periodLabel: `Week ${n}`, dueDate });
      break;
    case 'MONTHLY':
      // Generate 12 entries
      for month 1 to 12:
        entries.push({ periodDate: firstOfMonth, periodLabel: monthName, dueDate: lastOfMonth });
      break;
    case 'QUARTERLY':
      // 4 entries
      break;
    case 'ANNUAL':
      // 1 entry
      break;
    case 'BIR':
      // Hybrid: 12 monthly + 4 quarterly
      // Quarterly entries have periodLabel "1Q", "2Q", etc.
      // Quarterly periodDate is March/June/September/December 1.
      break;
  }
  return entries;
}
```

### Cutoff Logic

```typescript
function checkAndApplyCutoff(entry, newStatus, markedAt) {
  if (newStatus !== 'DONE') return newStatus;

  // Manila is UTC+8. Convert Manila end-of-day to UTC.
  const cutoff = manilaEndOfDayUtc(entry.dueDate);

  if (markedAt > cutoff) {
    return 'DONE_LATE'; // System auto-overrides
  }
  return 'DONE';
}
```

---

## 🎨 UI/UX REQUIREMENTS

### Design Principles
- Clean, professional, modern (think Linear, Notion, Asana)
- Spacious, not cramped
- Consistent spacing (Tailwind's spacing scale)
- Use shadcn/ui components everywhere possible
- Color palette:
  - Primary: Blue (`blue-600`)
  - Success/Done: Green (`green-500`)
  - Warning/Done Late: Orange (`orange-500`)
  - Danger/Overdue: Red (`red-500`)
  - Neutral/Not Done: Gray (`gray-400`)

### Status Colors

```ts
const statusColors = {
  NOT_DONE: 'bg-gray-100 text-gray-700',
  ONGOING: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
  DONE_LATE: 'bg-orange-100 text-orange-700',
};

const birStatusColors = {
  NO_SUBMISSION: 'bg-gray-100 text-gray-700',
  SUBMITTED_TO_FRG: 'bg-sky-100 text-sky-700',
  APPROVED_FOR_FILING: 'bg-blue-100 text-blue-700',
  FILED_FOR_PAYMENT: 'bg-yellow-100 text-yellow-700',
  FILED_AND_PAID: 'bg-green-100 text-green-700',
  FILED_NO_PAYMENT: 'bg-teal-100 text-teal-700',
};
```

### Critical UI Patterns

1. **List View Table** — must support thousands of rows × hundreds of columns
   - Use virtual scrolling (`@tanstack/react-virtual`)
   - Sticky first column + sticky header
   - Cells are buttons with status dropdown popover

2. **Tracker Builder** — wizard-style form
   - Step 1: Name, description, frequency
   - Step 2: Add sections (if BIR or Quarter/Annual)
   - Step 3: Add task lists per section
   - Step 4: Review & save

3. **Site Switcher** — top-nav dropdown for users with multiple site access

4. **Permission-Aware UI** — hide buttons/links the user can't use; never just disable

---

## 🔐 SECURITY CHECKLIST

- [ ] All API routes check authentication
- [ ] All API routes check authorization (role + site scope)
- [ ] Use Supabase query builder or parameterized SQL
- [ ] Validate all input with Zod schemas
- [ ] Rate limit API endpoints (use `@upstash/ratelimit`)
- [ ] CSRF protection on mutations
- [ ] File uploads: check size, type, scan for malware if possible
- [ ] Audit log is append-only — NO update or delete endpoints
- [ ] Sensitive operations (delete user, delete site) require confirmation
- [ ] Soft delete by default — preserve audit trail

---

## ACCEPTANCE CRITERIA

Current acceptance status:

1. ✅ Super Admin can create sites, users, and tracker categories
2. ✅ Super Admin can assign trackers to sites and users to sites
3. ✅ Site Manager logs in and sees only their assigned sites
4. ✅ Site Manager can add task lists, tasks, and assign personnel
5. ✅ Staff can mark tasks as Done/Ongoing/Not Done within their site
6. ✅ "Done Late" is auto-assigned when marked after cutoff
7. ✅ List View works for all 5 tracker types (Daily, Weekly, Monthly, BIR, Quarter/Annual)
8. ✅ Kanban View works with drag-and-drop
9. ✅ Calendar View shows due dates
10. ✅ Dashboard shows role-specific summary
11. ⏳ Audit log records every status change
12. ⏳ Notifications fire for overdue/upcoming tasks
13. ⏳ Mobile-responsive and dark-mode compatible
14. ✅ Core RBAC rules enforced on backend

---

## GETTING STARTED FOR A NEW SESSION

Start by:

1. Read `docs/PHASE_3_PLAN.md` for the next implementation plan, and `docs/PHASE_2_PLAN.md` for prior-phase context.
2. Run `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
3. Verify migrations `004` and `005` are applied in Supabase before testing tracker hierarchy/entries live.
4. Continue with Phase 4 unless the user asks for database application, Phase 3 polish, tests, or cleanup first.

Do not reintroduce Prisma. Do not re-plan Phase 1 or Phase 2 unless debugging a regression.

---

## 📌 ADDITIONAL CONTEXT

### Glossary of Domain Terms

- **BIR** — Bureau of Internal Revenue (Philippine tax authority)
- **FRG** — Financial Reporting Group
- **DCR** — Daily Collection Report
- **NDS** — Net Daily Sales
- **CPR** — Collection Performance Report
- **FS** — Financial Statement
- **AFS** — Audited Financial Statement
- **TRRC** — Tax Return Receipt Confirmation
- **QAP** — Quarterly Alphalist of Payees
- **SAWT** — Summary Alphalist of Withholding Tax
- **APV** — Accounts Payable Voucher
- **CV** — Check Voucher
- **BSM** — Bank Statement Monitoring
- **BCU** — Billing Charges Update
- **DCM** — Daily Cash Movement
- **CRB** — Cash Receipts Book
- **DCCR** — Daily Cash Collection Report
- **PCF** — Petty Cash Fund
- **EWT** — Expanded Withholding Tax
- **ITR** — Income Tax Return
- **RPT** — Real Property Tax

### Example Tracker Categories (Seed Data)

After build, seed the database with these example categories so the Super Admin has starting templates:

1. **Daily Operations** (Daily) — Collection, Disbursement, Billing, Administrative
2. **Weekly Reports** (Weekly) — DCR, NDS, CPR submissions
3. **Monthly FS Requirements** (Monthly) — CRB, DCCR, BSM, SL, DCM, NDS, BCU, etc.
4. **BIR Compliance** (BIR) — EWT Recon, Quarterly ITR
5. **Quarter/Annual Filings** (Quarter/Annual) — City Hall, Annual BIR Filings

---

## YOUR TASK NOW

Phase 3 is finished in code. The next feature work is Phase 4:

1. Notifications.
2. Audit log.
3. Attachments.
4. Reports and export.

If the database has not yet had `004` and `005` applied, do that before manual smoke testing.
