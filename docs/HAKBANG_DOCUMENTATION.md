# 🗂️ Hakbang — Project Documentation

> **Hakbang** *(Filipino: "to plan / to prepare")* — A multi-site, role-based project management and compliance tracker built for organizations managing recurring operational, financial, and regulatory tasks.

---

## 📑 Table of Contents

1. [Overview](#-overview)
2. [Goals & Objectives](#-goals--objectives)
3. [Tech Stack](#-tech-stack)
4. [Roles & Permissions (RBAC)](#-roles--permissions-rbac)
5. [System Hierarchy](#-system-hierarchy)
6. [Core Modules](#-core-modules)
7. [Tracker Types](#-tracker-types)
8. [Task Engine](#-task-engine)
9. [Data Model](#-data-model)
10. [Page & Route Structure](#-page--route-structure)
11. [Views](#-views)
12. [Notifications](#-notifications)
13. [Status Definitions](#-status-definitions)
14. [Build Roadmap](#-build-roadmap)
15. [Glossary](#-glossary)

---

## 🎯 Overview

**Hakbang** is a web-based project management and compliance tracking platform designed for businesses with multiple sites/offices that need to monitor recurring operational, accounting, and regulatory tasks (BIR filings, daily reports, monthly FS requirements, etc.).

It replaces traditional Excel-based trackers with a centralized, role-aware web app where:

- **Super Admins** define tracker templates and assign them to sites
- **Site Managers** oversee their assigned site's compliance
- **Staff** mark tasks as they complete them
- Everyone gets multiple views (List, Kanban, Calendar, Dashboard) of the same data

---

## 🎯 Goals & Objectives

| Goal | Description |
|---|---|
| Centralize tracking | One source of truth across all sites/offices |
| Enforce accountability | Every status change is logged with user + timestamp |
| Reduce missed deadlines | Auto-generate entries + flag overdue items |
| Multi-site visibility | Super Admin sees everything; site users see only their site |
| Flexible categories | SA can create any tracker type (Daily, Weekly, BIR, custom) |
| Audit-ready | Full audit log for compliance reporting |

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Tailwind CSS |
| Backend | Node.js (Express) **or** Next.js API Routes |
| Database | PostgreSQL (via Supabase / Neon / Railway) |
| Auth | ✅ Already implemented |
| State Management | Zustand or React Query |
| Drag & Drop (Kanban) | `@dnd-kit/core` |
| Calendar | `react-big-calendar` or `FullCalendar` |
| Notifications | In-app + email (Resend / SendGrid) |
| File Storage | Supabase Storage / AWS S3 |
| Hosting | Vercel (frontend) + Railway/Supabase (DB) |

---

## 👥 Roles & Permissions (RBAC)

### Role Matrix

| Capability | Super Admin | Site Manager | Staff |
|---|:---:|:---:|:---:|
| Create/edit/delete tracker categories | ✅ | ❌ | ❌ |
| Create/edit/delete sites | ✅ | ❌ | ❌ |
| Create/edit/delete users | ✅ | ❌ | ❌ |
| Assign trackers to sites | ✅ | ❌ | ❌ |
| Assign users to sites | ✅ | ❌ | ❌ |
| View all sites | ✅ | ❌ | ❌ |
| Add task lists/tasks within their site | ✅ | ✅ | ❌ |
| Assign personnel within their site | ✅ | ✅ | ❌ |
| Mark task status (Done, Ongoing, etc.) | ✅ | ✅ | ✅ |
| View Kanban / List / Calendar | ✅ | ✅ | ✅ |
| View audit log | ✅ | ✅ (site only) | ❌ |
| Export reports | ✅ | ✅ (site only) | ❌ |

### Role Descriptions

- **Super Admin** — System owner. Full access. Creates the system structure (categories, sites, users) and assigns relationships.
- **Site Manager** — Operates within their assigned site(s). Can manage tasks and personnel within their scope.
- **Staff** — End user. Can only mark tasks assigned to them or within their site.

---

## 🏛 System Hierarchy

```
Super Admin
   │
   ├── Tracker Categories (global templates)
   │     └── e.g. Daily, Weekly, Monthly, BIR, Quarter/Annual, [custom]
   │
   ├── Users (system-wide)
   │     └── Role: Super Admin / Site Manager / Staff
   │
   └── Sites (offices)
         │
         ├── Assigned Tracker Categories → become Site Trackers
         │     └── Sections → Task Lists → Tasks → Task Entries
         │
         └── Assigned Users (Site Managers + Staff)
```

### Relationship Rules

- A **Tracker Category** can be assigned to many sites
- A **Site** can have many tracker categories
- A **User** can be assigned to one or many sites
- A **Task** is always scoped to a site-tracker combination
- A **Task Entry** is the actual instance of a task on a specific date/period

---

## 🧩 Core Modules

### 1. Site Management
- Create / edit / delete sites
- Each site has a name, address, code, and active status
- Assign tracker categories to sites
- Assign users to sites with roles

### 2. User Management
- Create users with role assignment
- Assign users to one or more sites
- Deactivate users without deleting (preserve audit history)
- Reset passwords (handled by existing auth)

### 3. Tracker Category Management
- Create new tracker categories with custom names
- Define frequency: Daily / Weekly / Monthly / Quarterly / Annual / BIR (hybrid) / Custom
- Build template sections, task lists, and tasks
- Categories are global templates — can be assigned to any site

### 4. Task & Task List Management
- Add **Task Lists** (groupings/categories) within a tracker
- Add **Tasks** within a Task List
- Assign personnel (defaults to currently logged-in user)
- Configure skip rules (weekends, holidays)
- Auto-generate Task Entries for the period

### 5. Status Tracking
- Per-task-entry status: Not Done / Ongoing / Done / Done Late
- Auto-flag overdue items
- Track who marked what and when
- Add notes per entry

### 6. Views
- List View (table)
- Kanban View (drag & drop)
- Calendar View
- Dashboard (summary cards)

### 7. Notifications
- In-app + email
- Overdue alerts, upcoming deadlines, assignment notifications

### 8. Audit Log
- Every status change logged
- Filterable by user, site, tracker, date range

### 9. Attachments
- Upload supporting documents per task entry
- Linked to specific Task Entries

### 10. Reports & Export
- Completion rate per tracker / site / user
- Export to PDF or Excel for audit purposes

---

## 📋 Tracker Types

Hakbang supports flexible tracker creation. The Super Admin can create any tracker type. The system ships with these built-in templates:

### 1. 📅 Daily Tracker

**Structure:**
- Columns = dates (Jan 1, Jan 2, ..., Dec 31)
- Rows = tasks grouped by Task List
- Cells = status per task per day

**Example Task Lists:**
- Collection (Signed DCR, Signed CCS, Update BSM)
- Disbursement (Receiving of Billing/Invoice, BCU update, APV/CV)
- Billing (Preparation of DCM, Reconciliation)
- Administrative (Email queries, Follow-ups)

**Features:**
- Skip weekends/holidays toggle
- Daily completeness count

---

### 2. 📆 Weekly Tracker

**Structure:**
- Columns = Week 1, Week 2, ..., Week 49+
- Each week has: **Covered Period** (e.g. "Dec 30 to Jan 5"), **Due Date**, **Submission Date**
- Rows = tasks grouped by Task List
- Cells = status per task per week

**Per-Week Metadata:**
| Field | Example |
|---|---|
| Week Number | 1 |
| Covered Period | Dec 30 to Jan 5 |
| Due Date | Jan 7 |
| Submission Date | Jan 6 |
| Completeness | 4 / 6 items done |

**Example Task Lists:**
- DCR submission
- NDS submission
- CPR submission

---

### 3. 🗓️ Monthly Tracker

**Structure:**
- Columns = January, February, ..., December
- Rows = tasks grouped by Task List
- Cells = status per task per month

**Per-Month Metadata:**
| Field | Example |
|---|---|
| Month | January |
| Due Date | Jan 31 |
| Submission Date | Jan 30 |
| Completeness | 10 / 12 items done |

**Example Task Lists:**
- FS Requirements (CRB, DCCR, BSM, SL, DCM, NDS, BCU, PCF, EWT Recon, etc.)
- Billing (IFAE, Developer)
- Bank Reconciliation (1st–15th, 16th–30th)
- Financial Statement (FS, BR Summary, BR Macro)
- Management Fee

---

### 4. 🧾 BIR Tracker

**Structure:**
- Columns = Jan, Feb, **1Q**, Apr, May, **2Q**, Jul, Aug, **3Q**, Oct, Nov, **4Q**
- Quarter columns aggregate the 3 months before them
- Rows organized into Sections, each with its own sub-rows

**Sections (Super Admin can add more):**

**EWT Recon** sub-rows:
- Due Date
- Date submitted to FRG
- TRRC Date
- Payment Date
- Esubmission of QAP *(NA for non-quarter months)*
- Status

**Quarterly ITR** sub-rows:
- Due Date *(NA for non-quarter months)*
- Date for draft received from FRG
- TRRC Date
- Payment Date
- Esubmission of SAWT
- Status

**BIR-Specific Status Options:**
- No submission yet
- Submitted to FRG
- Approved and for filing
- Filed and for payment
- Filed and paid
- Filed with no payment

---

### 5. 🏛️ Quarter / Annual Tracker

**Structure:**
- Two main sections: **City Hall** and **Annual BIR Filings**
- Columns = Date of Payment (Q1, Q2, Q3, Q4) for quarterly items, or single date for annual

**City Hall Section:**

| Task | Frequency | Q1 | Q2 | Q3 | Q4 |
|---|---|---|---|---|---|
| Business Permit | Annual | date | — | — | — |
| Real Property Tax - Land | Annual | date | date | date | date |
| Real Property Tax - Machineries | Annual | date | date | date | date |
| Real Property Tax - Improvements | Quarterly | date | date | date | date |
| Real Property Tax - Building | Quarterly | date | — | — | — |
| Insurance | Quarterly | date | — | — | — |

**Annual BIR Filings Section:**
- 1604E (TRRC Date, Esubmission of Annual Alphalist of Payees)
- 1702 (TRRC Date, Payment Date, Esubmission of SAWT, Submission to BIR eAFS)
- AFS (Submission Date to SEC eFAST)

---

### 6. ➕ Custom Tracker

Super Admin can create completely custom trackers with:
- Custom name
- Custom frequency
- Custom sections, task lists, tasks
- Custom status options (if needed)

---

## ⚙️ Task Engine

### Auto-Generation

When a task is created, **Task Entries** are auto-generated for the entire year (or active period) based on the tracker frequency:

| Frequency | Entries Generated |
|---|---|
| Daily | 365 (or 260 if weekends skipped) |
| Weekly | 52 |
| Monthly | 12 |
| Quarterly | 4 |
| Annual | 1 |
| BIR | Hybrid — 12 monthly + 4 quarterly |

### Task Entry Lifecycle

```
[Created]
   ↓
Not Done  ──→  Ongoing  ──→  Done
                                ↓
                          (after cutoff)
                                ↓
                          Done Late
```

### Cutoff Logic

- **Daily**: 11:59 PM of the entry's date
- **Weekly**: 11:59 PM of the due date
- **Monthly**: 11:59 PM of the due date
- **Quarterly/Annual**: 11:59 PM of the due date
- **BIR**: Specific due date set per filing

If marked **Done** after cutoff → system auto-assigns **Done Late** (user cannot override).

### Task Creation Flow

```
1. User selects Tracker (e.g. Daily)
2. User selects or creates Task List (e.g. "Collection")
3. User enters Task Name (e.g. "Signed DCR")
4. Assigned Personnel defaults to logged-in user (can be reassigned)
5. Frequency inherited from tracker
6. Optional: configure skip rules (weekends, holidays)
7. Save → Task Entries auto-generated for the year
```

---

## 🗄️ Data Model

### Core Tables

```sql
-- USERS
users
  id (uuid, PK)
  email (string, unique)
  full_name (string)
  password_hash (string)
  role (enum: super_admin, site_manager, staff)
  is_active (boolean)
  created_at (timestamp)
  updated_at (timestamp)

-- SITES
sites
  id (uuid, PK)
  name (string)
  code (string, unique)
  address (text)
  is_active (boolean)
  created_at (timestamp)
  updated_at (timestamp)

-- USER ↔ SITE (many-to-many)
user_sites
  id (uuid, PK)
  user_id (FK → users)
  site_id (FK → sites)
  role (enum: site_manager, staff) -- role within this site
  created_at (timestamp)

-- TRACKER CATEGORIES (global templates)
tracker_categories
  id (uuid, PK)
  name (string) -- "Daily Operations", "BIR Filing", etc.
  description (text)
  frequency (enum: daily, weekly, monthly, quarterly, annual, bir, custom)
  status_options (jsonb) -- custom status options for this tracker
  is_active (boolean)
  created_by (FK → users)
  created_at (timestamp)

-- SITE TRACKERS (instances of categories assigned to sites)
site_trackers
  id (uuid, PK)
  site_id (FK → sites)
  tracker_category_id (FK → tracker_categories)
  year (integer) -- e.g. 2025
  is_active (boolean)
  created_at (timestamp)

-- TRACKER SECTIONS (for BIR, Quarter/Annual etc.)
tracker_sections
  id (uuid, PK)
  site_tracker_id (FK → site_trackers)
  name (string) -- "EWT Recon", "Quarterly ITR", "City Hall"
  display_order (integer)
  created_at (timestamp)

-- TASK LISTS (groupings)
task_lists
  id (uuid, PK)
  site_tracker_id (FK → site_trackers)
  section_id (FK → tracker_sections, nullable)
  name (string) -- "Collection", "Disbursement"
  display_order (integer)
  created_at (timestamp)

-- TASKS
tasks
  id (uuid, PK)
  task_list_id (FK → task_lists)
  name (string)
  assigned_to (FK → users)
  frequency (enum) -- inherited from tracker but can override
  skip_weekends (boolean)
  skip_holidays (boolean)
  is_active (boolean)
  created_by (FK → users)
  created_at (timestamp)

-- TASK ENTRIES (the actual log)
task_entries
  id (uuid, PK)
  task_id (FK → tasks)
  period_date (date) -- the date/week/month this entry represents
  period_label (string) -- "Week 1", "January", "1Q", etc.
  due_date (date)
  submission_date (date, nullable)
  status (enum: not_done, ongoing, done, done_late, OR BIR statuses)
  value (text, nullable) -- for date fields like "TRRC Date"
  marked_by (FK → users, nullable)
  marked_at (timestamp, nullable)
  note (text)
  created_at (timestamp)
  updated_at (timestamp)

-- ATTACHMENTS
attachments
  id (uuid, PK)
  task_entry_id (FK → task_entries)
  file_url (string)
  file_name (string)
  file_size (integer)
  uploaded_by (FK → users)
  uploaded_at (timestamp)

-- AUDIT LOG
audit_log
  id (uuid, PK)
  user_id (FK → users)
  action (string) -- "status_change", "task_created", etc.
  entity_type (string) -- "task_entry", "task", "site"
  entity_id (uuid)
  old_value (jsonb)
  new_value (jsonb)
  site_id (FK → sites, nullable) -- for scoping
  created_at (timestamp)

-- HOLIDAYS (optional, for skip logic)
holidays
  id (uuid, PK)
  date (date)
  name (string)
  is_recurring (boolean)
```

---

## 🖥 Page & Route Structure

```
PUBLIC
  /login                              ← already done
  /forgot-password

AUTHENTICATED (all roles)
  /dashboard                          ← role-based redirect
  /profile
  /notifications

SITE-SCOPED (Site Manager + Staff + SA)
  /sites/:siteId                      ← site dashboard
  /sites/:siteId/trackers             ← list of assigned trackers
  /sites/:siteId/trackers/:trackerId  ← specific tracker view
    ?view=list                        ← list view (default)
    ?view=kanban
    ?view=calendar
  /sites/:siteId/audit                ← audit log (site-scoped)

SUPER ADMIN ONLY
  /admin                              ← admin dashboard
  /admin/sites                        ← manage sites
  /admin/sites/new
  /admin/sites/:id/edit
  /admin/users                        ← manage users
  /admin/users/new
  /admin/users/:id/edit
  /admin/trackers                     ← manage tracker categories
  /admin/trackers/new
  /admin/trackers/:id/edit
  /admin/trackers/:id/assign          ← assign tracker to sites
  /admin/audit                        ← global audit log
  /admin/reports                      ← cross-site reports
```

---

## 🎨 Views

### 1. List View (Default)

Spreadsheet-like table view, mimicking the Excel reference.

- Rows = Tasks (grouped by Task List → Section)
- Columns = Time periods (days, weeks, months, quarters)
- Cells = clickable status indicators
- Sticky first column (task names) + sticky header
- Filters: by personnel, status, task list
- Bulk actions: select multiple cells and update

### 2. Kanban View

Card-based view for active tasks.

- Columns: Not Done / Ongoing / Done / Done Late
- Cards show: task name, due date, assigned personnel, site
- Drag & drop to change status (respects cutoff rules)
- Filters: by site, tracker, personnel

### 3. Calendar View

Monthly calendar with due dates plotted.

- Color-coded by status
- Click date to see all tasks due that day
- Toggle: month / week / agenda view
- Filters: by tracker, personnel

### 4. Dashboard

Summary cards + charts.

**Super Admin Dashboard:**
- Total sites / active sites
- Total users / active users
- Completion rate across all sites
- Overdue items count
- Recent activity feed

**Site Manager Dashboard:**
- Their site's completion rate
- Overdue items in their site
- Upcoming deadlines (next 7 days)
- Tasks by personnel breakdown

**Staff Dashboard:**
- My tasks today
- My overdue tasks
- My completion rate
- Quick mark-done actions

---

## 🔔 Notifications

### Triggers

| Event | Recipient | Channel |
|---|---|---|
| Task assigned to you | Assignee | In-app + email |
| Task due in 24 hours | Assignee | In-app + email |
| Task overdue | Assignee + Site Manager | In-app + email |
| Status changed | Site Manager | In-app |
| New tracker assigned to site | Site Manager | In-app + email |
| Daily digest | All users | Email (configurable) |

### Settings (per user)
- Enable/disable email notifications
- Choose digest frequency
- Mute specific trackers

---

## ✅ Status Definitions

### Standard Statuses (Daily, Weekly, Monthly trackers)

| Status | Color | Description |
|---|---|---|
| **Not Done** | Gray | Default state, no action taken |
| **Ongoing** | Blue | In progress, not yet complete |
| **Done** | Green | Completed before cutoff |
| **Done Late** | Orange | Completed after cutoff (auto-assigned) |

### BIR Tracker Statuses

| Status | Color | Description |
|---|---|---|
| **No submission yet** | Gray | Default |
| **Submitted to FRG** | Light Blue | Sent to FRG for review |
| **Approved and for filing** | Blue | FRG approved, ready to file |
| **Filed and for payment** | Yellow | Filed with BIR, payment pending |
| **Filed and paid** | Green | Complete |
| **Filed with no payment** | Teal | Filed but no payment required |

---

## 🚀 Build Roadmap

### Phase 1 — Foundation *(2-3 weeks)*
- [x] Auth (already done)
- [ ] Database schema setup
- [ ] User CRUD + role assignment
- [ ] Site CRUD
- [ ] User ↔ Site assignment
- [ ] RBAC middleware

### Phase 2 — Tracker Builder *(2 weeks)*
- [ ] Tracker Category CRUD (Super Admin)
- [ ] Section / Task List / Task management
- [ ] Assign trackers to sites
- [ ] Auto-generation of Task Entries

### Phase 3 — Tracker Views *(2-3 weeks)*
- [ ] List View (spreadsheet-style)
- [ ] Status updating with cutoff logic
- [ ] Tracker-specific views (Daily, Weekly, Monthly, BIR, Quarter/Annual)

### Phase 4 — Additional Views *(1-2 weeks)*
- [ ] Kanban View
- [ ] Calendar View
- [ ] Dashboard (role-specific)

### Phase 5 — Polish *(2 weeks)*
- [ ] Notifications (in-app + email)
- [ ] Audit log
- [ ] Attachments
- [ ] Reports & export

### Phase 6 — Production *(1 week)*
- [ ] Testing & QA
- [ ] Performance optimization
- [ ] Deployment
- [ ] Documentation for end users

---

## 📖 Glossary

| Term | Definition |
|---|---|
| **Tracker Category** | A reusable template defining what to track (e.g. "Daily Operations") |
| **Site Tracker** | An instance of a Tracker Category assigned to a specific site |
| **Section** | A sub-grouping within a tracker (e.g. "EWT Recon" inside BIR) |
| **Task List** | A grouping of related tasks (e.g. "Collection") |
| **Task** | A specific item to be tracked (e.g. "Signed DCR") |
| **Task Entry** | A single instance of a task on a specific date/period |
| **Cutoff** | The deadline after which a task becomes "Done Late" if marked done |
| **Completeness** | Percentage of tasks done within a period |
| **BIR** | Bureau of Internal Revenue (Philippines tax authority) |
| **FRG** | Financial Reporting Group |
| **DCR** | Daily Collection Report |
| **NDS** | (Net Daily Sales / similar — confirm with team) |
| **CPR** | Collection Performance Report |
| **FS** | Financial Statement |
| **AFS** | Audited Financial Statement |
| **TRRC** | Tax Return Receipt Confirmation |
| **QAP** | Quarterly Alphalist of Payees |
| **SAWT** | Summary Alphalist of Withholding Tax |
| **APV** | Accounts Payable Voucher |
| **CV** | Check Voucher |
| **BSM** | Bank Statement Monitoring |
| **BCU** | Billing Charges Update |
| **DCM** | Daily Cash Movement |
| **CRB** | Cash Receipts Book |
| **DCCR** | Daily Cash Collection Report |
| **PCF** | Petty Cash Fund |
| **EWT** | Expanded Withholding Tax |
| **ITR** | Income Tax Return |
| **IFAE** | (Confirm full term) |
| **RPT** | Real Property Tax |
| **RBAC** | Role-Based Access Control |

---

## 📝 Notes & Considerations

### Future Enhancements (Post-MVP)
- Mobile app (React Native)
- Real-time collaboration (WebSocket updates)
- AI-assisted task suggestions
- Integration with accounting software (QuickBooks, Xero)
- Multi-language support (English + Filipino)
- Custom report builder
- API for third-party integrations
- Bulk import from Excel (migration tool)

### Security Considerations
- All routes protected by auth middleware
- RBAC enforced on backend (not just UI)
- Audit log is append-only (cannot be edited or deleted)
- File uploads scanned for malware
- Rate limiting on API endpoints
- SQL injection prevention (use parameterized queries / ORM)

### Performance Considerations
- Index `task_entries` on `task_id` + `period_date`
- Cache tracker structure (rarely changes)
- Paginate List View for trackers with many tasks
- Use virtual scrolling for large tables
- Background job for auto-generating Task Entries

---

**Document Version:** 1.0
**Last Updated:** May 11, 2026
**Maintainer:** Project Owner

---

*Built with 🇵🇭 in mind.*
