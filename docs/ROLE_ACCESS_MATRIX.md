# Role Access Matrix

## Role Overview

The system uses a **two-tier RBAC model**:

- **System Role** — org-wide, stored in `organization_members.role`
- **Site Role** — per-site, stored in `user_sites.role`

| Role | Level | Scope |
|------|-------|-------|
| `SUPER_ADMIN` | 3 (highest) | All sites in the organization |
| `SITE_MANAGER` | 2 | Assigned sites only |
| `STAFF` | 1 (lowest) | Assigned sites only (read-only) |

> A `SUPER_ADMIN` does not need entries in `user_sites` — their system role implicitly grants access to every site.

---

## Page Access

| Page | Route | SUPER_ADMIN | SITE_MANAGER | STAFF |
|------|-------|:-----------:|:------------:|:-----:|
| Dashboard | `/` | ✅ | ✅ | ✅ |
| Sites List | `/sites` | ✅ all sites | ✅ assigned sites | ✅ assigned sites |
| Site Detail | `/sites/[siteId]` | ✅ | ✅ assigned | ✅ assigned |
| Site Trackers | `/sites/[siteId]/trackers` | ✅ | ✅ assigned | ✅ assigned |
| Tracker Detail | `/sites/[siteId]/trackers/[trackerId]` | ✅ | ✅ assigned | ✅ assigned |
| Task Detail | `/sites/[siteId]/trackers/[trackerId]/tasks/[taskId]` | ✅ | ✅ assigned | ✅ assigned |
| Site Audit Log | `/sites/[siteId]/audit` | ✅ | ✅ assigned | ❌ |
| Notifications | `/notifications` | ✅ | ✅ | ✅ |
| Settings | `/settings` | ✅ | ✅ | ✅ |
| **Admin — Users** | `/admin/users` | ✅ | ❌ | ❌ |
| **Admin — Sites** | `/admin/sites` | ✅ | ❌ | ❌ |
| **Admin — Trackers** | `/admin/trackers` | ✅ | ❌ | ❌ |
| **Admin — Audit** | `/admin/audit` | ✅ | ❌ | ❌ |

> All `/admin/*` routes are blocked at the middleware level for non-`SUPER_ADMIN` users.

---

## API Permissions

### Users

| Endpoint | Method | SUPER_ADMIN | SITE_MANAGER | STAFF |
|----------|--------|:-----------:|:------------:|:-----:|
| `/api/users` | GET | ✅ | ❌ | ❌ |
| `/api/users` | POST (invite) | ✅ | ❌ | ❌ |
| `/api/users/[id]` | GET | ✅ | ❌ | ❌ |
| `/api/users/[id]` | PUT | ✅ | ❌ | ❌ |
| `/api/users/[id]/sites` | GET/PUT | ✅ | ❌ | ❌ |

### Sites

| Endpoint | Method | SUPER_ADMIN | SITE_MANAGER | STAFF |
|----------|--------|:-----------:|:------------:|:-----:|
| `/api/sites` | GET | ✅ all | ✅ assigned | ✅ assigned |
| `/api/sites` | POST | ✅ | ❌ | ❌ |
| `/api/sites/[id]` | GET | ✅ | ✅ assigned | ✅ assigned |
| `/api/sites/[id]` | PUT | ✅ | ❌ | ❌ |
| `/api/sites/[id]` | DELETE | ✅ | ❌ | ❌ |
| `/api/sites/[id]/users` | GET | ✅ | ✅ assigned | ❌ |
| `/api/sites/[id]/users/[userId]` | PUT/DELETE | ✅ | ❌ | ❌ |
| `/api/sites/[id]/trackers` | GET | ✅ | ✅ assigned | ✅ assigned |
| `/api/sites/[id]/trackers/[trackerId]` | PUT/DELETE | ✅ | ✅ assigned | ❌ |

### Trackers & Sections

| Endpoint | Method | SUPER_ADMIN | SITE_MANAGER | STAFF |
|----------|--------|:-----------:|:------------:|:-----:|
| `/api/site-trackers` | GET | ✅ | ✅ assigned | ✅ assigned |
| `/api/site-trackers` | POST | ✅ | ✅ assigned | ❌ |
| `/api/site-trackers/[id]` | GET | ✅ | ✅ assigned | ✅ assigned |
| `/api/site-trackers/[id]` | PUT/DELETE | ✅ | ✅ assigned | ❌ |
| `/api/site-trackers/[id]/hierarchy` | GET | ✅ | ✅ assigned | ✅ assigned |
| `/api/site-trackers/[id]/sections` | GET | ✅ | ✅ assigned | ✅ assigned |
| `/api/site-trackers/[id]/sections` | POST | ✅ | ✅ assigned | ❌ |
| `/api/site-trackers/[id]/sections/reorder` | PUT | ✅ | ✅ assigned | ❌ |
| `/api/sections/[id]` | PUT/DELETE | ✅ | ✅ assigned | ❌ |
| `/api/tracker-categories` | GET | ✅ | ✅ | ✅ |
| `/api/tracker-categories` | POST/PUT/DELETE | ✅ | ❌ | ❌ |

### Task Lists & Tasks

| Endpoint | Method | SUPER_ADMIN | SITE_MANAGER | STAFF |
|----------|--------|:-----------:|:------------:|:-----:|
| `/api/site-trackers/[id]/task-lists` | GET | ✅ | ✅ assigned | ✅ assigned |
| `/api/site-trackers/[id]/task-lists` | POST | ✅ | ✅ assigned | ❌ |
| `/api/site-trackers/[id]/task-lists/reorder` | PUT | ✅ | ✅ assigned | ❌ |
| `/api/task-lists/[id]` | PUT/DELETE | ✅ | ✅ assigned | ❌ |
| `/api/task-lists/[id]/tasks` | GET | ✅ | ✅ assigned | ✅ assigned |
| `/api/task-lists/[id]/tasks` | POST | ✅ | ✅ assigned | ❌ |
| `/api/task-lists/[id]/tasks/reorder` | PUT | ✅ | ✅ assigned | ❌ |
| `/api/tasks/[id]` | GET | ✅ | ✅ assigned | ✅ assigned |
| `/api/tasks/[id]` | PUT/DELETE | ✅ | ✅ assigned | ❌ |
| `/api/tasks/[id]/regenerate` | POST | ✅ | ✅ assigned | ❌ |

### Task Entries & Attachments

| Endpoint | Method | SUPER_ADMIN | SITE_MANAGER | STAFF |
|----------|--------|:-----------:|:------------:|:-----:|
| `/api/tasks/[id]/entries` | GET | ✅ | ✅ assigned | ✅ assigned |
| `/api/task-entries` | POST | ✅ | ✅ assigned | ✅ assigned |
| `/api/task-entries/[id]` | GET | ✅ | ✅ assigned | ✅ assigned |
| `/api/task-entries/[id]` | PUT/DELETE | ✅ | ✅ assigned | ✅ own entries |
| `/api/task-entries/[id]/attachments` | GET | ✅ | ✅ assigned | ✅ assigned |
| `/api/task-entries/[id]/attachments` | POST | ✅ | ✅ assigned | ✅ assigned |
| `/api/task-entries/[id]/attachments/sign` | POST | ✅ | ✅ assigned | ✅ assigned |
| `/api/attachments/[id]` | DELETE | ✅ | ✅ assigned | ✅ own |

### Audit Log

| Endpoint | Method | SUPER_ADMIN | SITE_MANAGER | STAFF |
|----------|--------|:-----------:|:------------:|:-----:|
| `/api/audit-log` | GET | ✅ all sites | ✅ assigned sites + org-level events | ❌ |

### Dashboard & Exports

| Endpoint | Method | SUPER_ADMIN | SITE_MANAGER | STAFF |
|----------|--------|:-----------:|:------------:|:-----:|
| `/api/dashboard/summary` | GET | ✅ all sites | ✅ assigned sites | ✅ assigned sites |
| `/api/dashboard/export.pdf` | GET | ✅ | ✅ assigned | ❌ |
| `/api/dashboard/export.xlsx` | GET | ✅ | ✅ assigned | ❌ |
| `/api/site-trackers/[id]/export.pdf` | GET | ✅ | ✅ assigned | ❌ |
| `/api/site-trackers/[id]/export.xlsx` | GET | ✅ | ✅ assigned | ❌ |

### Notifications

| Endpoint | Method | SUPER_ADMIN | SITE_MANAGER | STAFF |
|----------|--------|:-----------:|:------------:|:-----:|
| `/api/notifications` | GET | ✅ own | ✅ own | ✅ own |
| `/api/notifications/[id]` | PUT (mark read) | ✅ own | ✅ own | ✅ own |

---

## Feature Summary

| Feature | SUPER_ADMIN | SITE_MANAGER | STAFF |
|---------|:-----------:|:------------:|:-----:|
| View dashboard | ✅ | ✅ | ✅ |
| View assigned sites | ✅ all | ✅ | ✅ |
| View trackers | ✅ | ✅ | ✅ |
| View tasks & entries | ✅ | ✅ | ✅ |
| Submit task entries | ✅ | ✅ | ✅ |
| Upload attachments | ✅ | ✅ | ✅ |
| Create/edit trackers | ✅ | ✅ | ❌ |
| Create/edit tasks | ✅ | ✅ | ❌ |
| Reorder sections/tasks | ✅ | ✅ | ❌ |
| Export reports (PDF/XLSX) | ✅ | ✅ | ❌ |
| View audit logs | ✅ all | ✅ assigned | ❌ |
| Manage site members | ✅ | ❌ | ❌ |
| Create/delete sites | ✅ | ❌ | ❌ |
| Manage tracker categories | ✅ | ❌ | ❌ |
| Invite / manage users | ✅ | ❌ | ❌ |
| Access `/admin/*` panel | ✅ | ❌ | ❌ |

---

## Permission Helper Reference

Defined in `lib/rbac.ts`:

| Helper | Guards |
|--------|--------|
| `requireAuth()` | Any authenticated user |
| `requireRole([...roles])` | Exact role match |
| `requireSuperAdmin()` | `SUPER_ADMIN` only |
| `requireSiteManagerOrAbove()` | `SUPER_ADMIN` or `SITE_MANAGER` |
| `canReadAtSite(caller, siteId)` | `SUPER_ADMIN` + all assigned users |
| `canWriteAtSite(caller, siteId)` | `SUPER_ADMIN` + `SITE_MANAGER` on site |
