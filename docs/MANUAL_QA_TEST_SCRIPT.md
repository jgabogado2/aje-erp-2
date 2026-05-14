# Manual QA Test Script

System: Hakbang / AJE ERP compliance tracker  
Scope: Overall functional regression across authentication, RBAC, dashboard, site administration, tracker setup, task entry tracking, attachments, exports, audit logs, and notifications.  
Last updated: 2026-05-14

---

## 1. Test Objective

Verify that the system works end-to-end for the three supported roles:

- `SUPER_ADMIN`
- `SITE_MANAGER`
- `STAFF`

This script is intended for manual QA before release, after major feature changes, or after database/auth changes.

---

## 2. Required Environment

| Item | Requirement |
| --- | --- |
| App URL | Local, staging, or production candidate URL |
| Browser | Latest Chrome preferred; repeat smoke checks in Safari/Firefox if available |
| Screen sizes | Desktop width, tablet width, mobile width |
| Database | Seeded or prepared with one organization |
| Auth | Working Google/NextAuth login |
| Storage | Supabase Storage configured for attachments |
| Email | Resend/email provider configured if email notifications are being verified |

Recommended local commands before manual QA:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm dev
```

---

## 3. Test Accounts

Prepare one account per role.

| Role | Email | Expected Access |
| --- | --- | --- |
| SUPER_ADMIN | `<super-admin-email>` | All sites, all admin pages, all exports, all audit logs |
| SITE_MANAGER | `<site-manager-email>` | Assigned sites only, can manage tracker structure and entries on assigned sites |
| STAFF | `<staff-email>` | Assigned sites only, can view trackers and update entries/own attachments, cannot access admin pages |

Site access setup:

- Assign `SITE_MANAGER` and `STAFF` to the QA site.
- Leave them unassigned from at least one other site to test access denial.

---

## 4. Test Data Naming

Use unique names to avoid colliding with existing records.

| Entity | Suggested Value |
| --- | --- |
| Site | `QA Site 2026-05-14` |
| Site code | `QA-20260514` |
| Tracker category | `QA Monthly Compliance 2026-05-14` |
| Section | `QA Accounting Section` |
| Task item | `QA Monthly FS Package` |
| Subtask | `QA Bank Reconciliation` |
| Attachment | Small PDF or image under the configured upload limit |

---

## 5. Pass/Fail Rules

Mark each test as:

- `PASS` - Actual result matches expected result.
- `FAIL` - Actual result differs, errors unexpectedly, or data is saved incorrectly.
- `BLOCKED` - Test cannot be executed due to missing setup, environment issue, or dependency.
- `N/A` - Feature intentionally disabled or out of release scope.

Capture evidence for failures:

- Browser, URL, account used, timestamp
- Steps performed
- Screenshot or video
- Console/network error if relevant
- Expected vs actual result

---

## 6. Test Cases

### QA-001 - Public Routing And Sign-In

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Open the app in a fresh/private browser session. | Unauthenticated user is redirected to `/signin` or sees the sign-in screen. |
| 2 | Click the Google sign-in option. | OAuth flow starts without console errors. |
| 3 | Sign in as `SUPER_ADMIN`. | User lands on dashboard `/`. |
| 4 | Sign out or clear session, then repeat for `SITE_MANAGER` and `STAFF`. | Each authenticated user can enter the app. |
| 5 | Try opening a protected route while signed out. | User is redirected to sign in and cannot view protected content. |

### QA-002 - Dashboard Summary

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Sign in as `SUPER_ADMIN` and open `/`. | Dashboard renders without loading forever. |
| 2 | Review summary cards. | Sites, Members, Completion, Overdue, and due-soon style metrics display sensible values. |
| 3 | Use dashboard export menu for PDF and XLSX if visible. | Downloads complete and files are non-empty. |
| 4 | Sign in as `SITE_MANAGER`. | Dashboard shows only assigned-site context and role badge. |
| 5 | Sign in as `STAFF`. | Dashboard shows assigned-site context and does not expose admin actions. |

### QA-003 - Super Admin Site Management

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Sign in as `SUPER_ADMIN`; open `/admin/sites`. | Sites table loads. |
| 2 | Click `New site` and create the QA site. | Site appears in the table with correct code, name, address, and Active status. |
| 3 | Edit the QA site name or address. | Updated value persists after refresh. |
| 4 | Deactivate the QA site. | Status changes to Inactive and success toast appears. |
| 5 | Reactivate the QA site. | Status changes back to Active. |
| 6 | Open the site detail page. | Site details and tracker list render. |

### QA-004 - Super Admin User Management

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Open `/admin/users`. | Users table loads with member, role, sites, and status columns. |
| 2 | Search by QA user name, email, and role. | Search filters correctly and clears correctly. |
| 3 | Invite or edit a test member as `SITE_MANAGER`. | Role is saved and visible in the table. |
| 4 | Assign the `SITE_MANAGER` to the QA site. | Sites count updates and access works for that user. |
| 5 | Invite or edit a test member as `STAFF`. | Role is saved and visible in the table. |
| 6 | Assign the `STAFF` user to the QA site. | Sites count updates and access works for that user. |
| 7 | Deactivate a non-current test member, then reactivate. | Status toggles correctly; current user cannot accidentally lose required access. |

### QA-005 - Tracker Category Management

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Open `/admin/trackers`. | Tracker categories table loads. |
| 2 | Click `New category`. | Category form opens. |
| 3 | Create the QA tracker category using frequency `MONTHLY`. | Category appears with Monthly frequency and Active status. |
| 4 | Edit the category description or template details. | Changes persist after refresh. |
| 5 | Deactivate the category. | Category is hidden from assignment choices where inactive categories should be excluded. |
| 6 | Reactivate the category. | Category becomes assignable again. |

### QA-006 - Assign Tracker To Site

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Open the QA site detail page as `SUPER_ADMIN`. | Page shows trackers for the current year. |
| 2 | Click `Assign tracker`. | Assignment dialog opens. |
| 3 | Select the QA tracker category and save. | Tracker appears in the site's tracker list. |
| 4 | Click the tracker row. | Tracker workspace opens at `/sites/[siteId]/trackers/[trackerId]`. |
| 5 | Unassign and reassign the tracker if safe for the environment. | Unassign removes it for the current year; reassign restores it. |

### QA-007 - Tracker Workspace Views

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Open the assigned QA tracker. | Header shows site, tracker category, year, and frequency. |
| 2 | Switch to `List`. | List view renders task periods/statuses or an empty state. |
| 3 | Switch to `Kanban`. | Kanban columns render and do not crash. |
| 4 | Switch to `Calendar`. | Calendar renders entries by due/period date. |
| 5 | Switch to `Manage` as `SUPER_ADMIN` or `SITE_MANAGER`. | Manage view is available to write roles. |
| 6 | Sign in as `STAFF` and open the same tracker. | Staff can view List/Kanban/Calendar but does not see privileged manage controls. |

### QA-008 - Sections, Task Items, And Subtasks

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | In Manage view, click `Add section`. | Section dialog opens. |
| 2 | Create `QA Accounting Section`. | Section appears in Manage view. |
| 3 | Add task item `QA Monthly FS Package` inside the section. | Task item appears with frequency, assignee, and skip-rule details if configured. |
| 4 | Add subtask `QA Bank Reconciliation`. | Subtask appears under the task item. |
| 5 | Edit the section, task item, and subtask names. | Each edit persists after refresh. |
| 6 | Drag/reorder sections, task items, or subtasks where supported. | Order updates and remains after refresh. |
| 7 | Delete a temporary subtask. | Confirmation appears and delete succeeds. |

### QA-009 - Task Entry Generation And Detail Page

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Open the task item entries page from the task item card/list icon. | Task entries table loads. |
| 2 | Confirm generated periods for a Monthly tracker. | Expected monthly periods are present. |
| 3 | Click `Regenerate` as `SUPER_ADMIN` or `SITE_MANAGER`. | Future entries regenerate without duplicating existing past/current entries. |
| 4 | Sign in as `STAFF` and open the same task item entries page. | Staff can view entries; privileged regenerate action is not available. |

### QA-010 - Entry Status, Submission Date, Notes, And Subtasks

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | On a task entry, change status from `Not done` to `Ongoing`. | Status saves and persists after refresh. |
| 2 | Change status to `Done`. | Marked metadata shows user and timestamp. |
| 3 | For an overdue entry, change status to `Done`. | System records `Done late` when cutoff rules apply. |
| 4 | Add or update `Submission` date. | Date saves and persists. |
| 5 | Add a note. | Note saves and persists. |
| 6 | Check and uncheck subtask completion if subtasks exist. | Subtask completion saves and updates the entry. |
| 7 | Repeat status update as `STAFF`. | Staff can update allowed entries within assigned site. |

### QA-011 - BIR Tracker Statuses

Run this case if a BIR tracker category exists.

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Assign or open a BIR tracker. | Period columns include months and quarter labels such as `1Q`, `2Q`, `3Q`, `4Q`. |
| 2 | Open a BIR task item entries page. | BIR status dropdown is visible. |
| 3 | Set BIR status values through the available options. | Each BIR status saves and persists. |
| 4 | Verify normal task status still works. | Regular status and BIR status can both be saved as intended. |

### QA-012 - Attachments

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Open an entry surface that supports attachments. | Attachment list/uploader is visible where implemented. |
| 2 | Upload a small valid file. | Upload completes and file appears in attachment list. |
| 3 | Refresh the page. | Attachment remains visible. |
| 4 | Download/open the attachment. | File downloads or opens correctly. |
| 5 | Delete the attachment as the uploader or permitted role. | Attachment is removed and does not reappear after refresh. |
| 6 | Try deleting as a user without ownership if applicable. | Action is blocked or returns a permission error. |

### QA-013 - Reports And Exports

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | As `SUPER_ADMIN`, export dashboard PDF. | PDF downloads with non-empty content. |
| 2 | As `SUPER_ADMIN`, export dashboard XLSX. | Spreadsheet downloads with expected summary data. |
| 3 | Open tracker workspace and export tracker PDF. | PDF downloads and reflects selected tracker data. |
| 4 | Export tracker XLSX. | Spreadsheet downloads and opens without corruption. |
| 5 | Repeat export as `SITE_MANAGER` for assigned site. | Export succeeds for assigned site. |
| 6 | Attempt export as `STAFF`. | Export action is hidden or request is denied. |

### QA-014 - Audit Logs

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Perform at least one structural edit and one entry status update. | Actions complete successfully. |
| 2 | Open `/admin/audit` as `SUPER_ADMIN`. | Audit rows show recent changes across the organization. |
| 3 | Filter by site, actor, action, or date range where available. | Table updates to matching records only. |
| 4 | Open `/sites/[siteId]/audit` as `SITE_MANAGER`. | Site manager sees audit records for assigned site only. |
| 5 | Open audit pages as `STAFF`. | Staff is denied or redirected to unauthorized page. |

### QA-015 - Notifications

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Open the notification bell/menu. | Recent notifications load without errors. |
| 2 | Open `/notifications`. | Notification list renders. |
| 3 | Mark a notification as read. | Read state updates and persists after refresh. |
| 4 | Trigger or wait for reminder generation if available. | Due/overdue reminders are created for the intended users only. |
| 5 | If email delivery is enabled, check the recipient inbox. | Email content is delivered to intended user and contains correct reminder details. |

### QA-016 - Role-Based Access Control

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | As `SITE_MANAGER`, try opening `/admin/users`, `/admin/sites`, `/admin/trackers`, `/admin/audit`. | User is redirected to `/unauthorized` or blocked. |
| 2 | As `STAFF`, try opening all `/admin/*` pages. | User is redirected to `/unauthorized` or blocked. |
| 3 | As `SITE_MANAGER`, open an assigned site. | Access succeeds. |
| 4 | As `SITE_MANAGER`, open an unassigned site URL directly. | Access is denied. |
| 5 | As `STAFF`, open an assigned site tracker. | Read access succeeds. |
| 6 | As `STAFF`, attempt to create/edit sections, task items, subtasks, tracker assignment, users, or sites. | UI hides actions and API blocks direct mutation attempts. |

### QA-017 - Error, Empty, And Loading States

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Visit a site with no trackers. | Empty state explains that a tracker must be assigned. |
| 2 | Visit a tracker with no sections/task items. | Empty state prompts write roles to add a section. |
| 3 | Search users with a query that has no results. | No matches state appears. |
| 4 | Temporarily simulate a network failure in browser devtools and refresh a data-heavy page. | Error or retry state appears; app does not show a blank screen. |
| 5 | Restore network and retry. | Page recovers without requiring a full sign out. |

### QA-018 - Responsive Layout

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | At desktop width, navigate dashboard, admin pages, site detail, tracker workspace. | Layout is readable and no controls overlap. |
| 2 | At tablet width, repeat the same route smoke check. | Tables, tabs, dialogs, and navigation remain usable. |
| 3 | At mobile width around 375px, open dashboard. | Sidebar/top navigation remains usable and content does not overflow horizontally except intended data tables. |
| 4 | At mobile width, open tracker List/Kanban/Calendar. | Views remain usable; tabs are reachable. |
| 5 | At mobile width, open forms/dialogs. | Dialog content scrolls and action buttons are reachable. |

### QA-019 - Basic Accessibility And Usability

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Navigate main pages using keyboard Tab/Shift+Tab. | Focus order is logical and visible. |
| 2 | Activate buttons/links with Enter or Space where applicable. | Controls work without mouse. |
| 3 | Open and close dialogs using keyboard. | Focus is trapped in dialog and returns to trigger after close. |
| 4 | Check destructive actions. | Confirmation dialogs are clear and cancel works. |
| 5 | Verify key icons/buttons have labels or tooltips. | Meaning is available to users and screen readers where applicable. |

### QA-020 - Data Persistence And Refresh

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Make changes to site, tracker, task item, entry status, note, and attachment. | Each save shows success or visible state change. |
| 2 | Hard refresh the page. | Saved data remains. |
| 3 | Sign out and sign back in. | Saved data remains. |
| 4 | Open the same records from another browser/account with permission. | Updated data is visible. |

---

## 7. Cleanup Checklist

Run this after QA if testing in a shared environment.

| Item | Done |
| --- | --- |
| Remove or deactivate QA tracker category if no longer needed. | `[ ]` |
| Remove QA tracker assignment from QA site if no longer needed. | `[ ]` |
| Delete temporary attachments. | `[ ]` |
| Deactivate or remove temporary QA users according to environment policy. | `[ ]` |
| Delete QA site only if it has no data that should be retained. | `[ ]` |
| Record any failed cases in the issue tracker. | `[ ]` |

---

## 8. Release Sign-Off

| Area | Status | Notes |
| --- | --- | --- |
| Authentication |  |  |
| RBAC |  |  |
| Dashboard |  |  |
| Admin - Sites |  |  |
| Admin - Users |  |  |
| Admin - Tracker Categories |  |  |
| Site Tracker Assignment |  |  |
| Tracker Workspace |  |  |
| Task Entries |  |  |
| Attachments |  |  |
| Reports/Exports |  |  |
| Audit Logs |  |  |
| Notifications |  |  |
| Responsive Layout |  |  |
| Accessibility Smoke Check |  |  |

Final QA decision: `PASS / FAIL / BLOCKED`

QA tester:  
Date tested:  
Environment tested:
