import type { SystemRole, SiteRole } from '@/lib/auth.types';
import type { BirStatus, Frequency, TaskStatus } from '@/lib/tracker.types';
import type { NotificationKind } from '@/lib/validations/notification';
import type {
  SectionTemplate,
  TaskListTemplate,
} from '@/lib/validations/tracker';

// DB row shapes returned by /api/* — kept in one place so UI and hooks
// agree on the contract. Keep these in sync with the SQL schema.

export interface Organization {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Site {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  emailVerified?: string | null;
}

export interface UserSite {
  id: string;
  user_id: string;
  site_id: string;
  role: SiteRole;
  created_at: string;
  user?: UserProfile | null;
}

export interface OrganizationMember {
  id: string;
  user_id: string | null;
  email: string;
  organization_id: string;
  role: SystemRole;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  user?: UserProfile | null;
}

// Returned by GET /api/users — adds a derived count of site assignments.
export interface OrganizationMemberWithStats extends OrganizationMember {
  sites_count: number;
}

// Returned by GET /api/users/[id]/sites — UserSite joined with its Site.
export interface UserSiteAssignment {
  id: string;
  user_id: string;
  site_id: string;
  role: SiteRole;
  created_at: string;
  site: Pick<Site, 'id' | 'code' | 'name' | 'organization_id' | 'is_active'>;
}

// Tracker system ----------------------------------------------------------

export interface TrackerCategory {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  frequency: Frequency;
  section_templates: SectionTemplate[];
  task_list_templates: TaskListTemplate[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteTracker {
  id: string;
  site_id: string;
  tracker_category_id: string;
  year: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Returned by GET /api/sites/[id]/trackers — embeds the category for display.
export interface SiteTrackerWithCategory extends SiteTracker {
  tracker_category: Pick<
    TrackerCategory,
    'id' | 'name' | 'description' | 'frequency'
  >;
}

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  organization_id: string;
  site_id: string | null;
  entity_type:
    | 'task_entry'
    | 'site'
    | 'user'
    | 'tracker_category'
    | 'site_tracker'
    | 'tracker_section'
    | 'task_list'
    | 'task'
    | 'holiday';
  entity_id: string;
  action: 'create' | 'update' | 'delete' | 'status_change';
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
  actor?: Pick<UserProfile, 'id' | 'name' | 'email' | 'image'> | null;
  site?: { id: string; code: string; name: string } | null;
}

export interface AuditLogPage {
  rows: AuditLogEntry[];
  next_cursor: string | null;
}

export interface NotificationPayload {
  entry_id?: string;
  task_list_id?: string;
  task_list_name?: string;
  site_tracker_id?: string;
  site_id?: string;
  period_label?: string;
  due_date?: string;
  status?: TaskStatus;
  [key: string]: unknown;
}

export interface NotificationEntry {
  id: string;
  user_id: string;
  organization_id: string;
  site_id: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  payload: NotificationPayload;
  dedupe_key: string;
  read_at: string | null;
  emailed_at: string | null;
  created_at: string;
  site?: { id: string; code: string; name: string } | null;
}

export interface NotificationPage {
  rows: NotificationEntry[];
  unread_count: number;
  next_cursor: string | null;
}

// Attachments (Phase 4b) ------------------------------------------------

export interface Attachment {
  id: string;
  task_entry_id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

/** GET response — embeds a short-lived signed URL for direct download. */
export interface AttachmentWithUrl extends Attachment {
  signed_url: string;
  uploader?: Pick<UserProfile, 'id' | 'name' | 'email' | 'image'> | null;
}

export interface AttachmentSignResponse {
  upload_url: string;
  storage_path: string;
  expires_in: number;
  /**
   * Some Supabase versions return an opaque token alongside the URL; clients
   * pass it back in the PUT request header. We forward it untouched.
   */
  token?: string;
}

export interface Holiday {
  id: string;
  organization_id: string;
  date: string;
  name: string;
  is_recurring: boolean;
  created_at: string;
}

// Phase 2b: per-site instantiation of category templates ------------------

export interface TrackerSection {
  id: string;
  site_tracker_id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// `task_lists` is the "task item" — the entry-generating row that carries
// frequency, assignee, and skip rules. (Migration 007 moved these fields
// off the old `tasks` table and onto `task_lists`.)
export interface TaskList {
  id: string;
  site_tracker_id: string;
  tracker_section_id: string | null;
  name: string;
  display_order: number;
  frequency: Frequency;
  assigned_to: string | null;
  skip_weekends: boolean;
  skip_holidays: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Hierarchy GET embeds the assignee so the UI doesn't need a second lookup.
export interface TaskListWithAssignee extends TaskList {
  assignee?: Pick<UserProfile, 'id' | 'name' | 'email' | 'image'> | null;
}

// `tasks` is the "subtask" — optional lightweight row under a task_list.
// Subtasks inherit the parent's frequency/assignee/skip rules; they don't
// generate their own entries. Completion is tracked per parent entry via
// task_entries.subtask_completions.
export interface Task {
  id: string;
  task_list_id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// Back-compat alias for older imports that referenced the old shape. The
// hierarchy/entries APIs return assignee on the parent task_list now.
export type TaskWithAssignee = Task;

export interface TaskEntry {
  id: string;
  task_list_id: string;
  period_date: string;
  period_label: string;
  due_date: string;
  submission_date: string | null;
  status: TaskStatus;
  bir_status: BirStatus | null;
  value: string | null;
  marked_by: string | null;
  marked_at: string | null;
  note: string | null;
  /** IDs of subtasks (Task.id) that are completed for this period. */
  subtask_completions: string[];
  created_at: string;
  updated_at: string;
  marker?: Pick<UserProfile, 'id' | 'name' | 'email' | 'image'> | null;
  /** Number of attachments on this entry (populated by the entries list endpoint). */
  attachments_count?: number;
}

export interface TaskEntriesPayload {
  task_list: TaskListWithAssignee & {
    subtasks: Task[];
    site_tracker: SiteTracker & {
      tracker_category: Pick<
        TrackerCategory,
        'id' | 'name' | 'description' | 'frequency'
      >;
      site: Pick<Site, 'id' | 'code' | 'name' | 'organization_id'>;
    };
  };
  entries: TaskEntry[];
}

export interface TrackerEntriesSummary {
  total: number;
  not_done: number;
  ongoing: number;
  done: number;
  done_late: number;
  overdue: number;
  completion_rate: number;
}

export interface TrackerEntriesPayload {
  site_tracker: SiteTracker & {
    tracker_category: TrackerCategory;
    site: Pick<Site, 'id' | 'code' | 'name' | 'organization_id'>;
  };
  sections: TrackerSection[];
  /** task_lists = "task items" — they own frequency/assignee/skip and entries. */
  task_lists: TaskListWithAssignee[];
  /** tasks = "subtasks" — optional checklist items under each task_list. */
  tasks: Task[];
  entries: TaskEntry[];
  summary: TrackerEntriesSummary;
}

export interface DashboardSummary {
  sites_count: number;
  users_count: number;
  entries_total: number;
  overdue_count: number;
  due_next_7_days: number;
  completion_rate: number;
  by_status: Array<{ status: TaskStatus; count: number }>;
  by_site: Array<{ site_id: string; site_name: string; completion_rate: number }>;
  by_assignee: Array<{
    user_id: string;
    name: string;
    overdue_count: number;
    completion_rate: number;
  }>;
  overdue_entries: Array<
    TaskEntry & {
      task_list?: Pick<TaskList, 'id' | 'name' | 'assigned_to' | 'site_tracker_id'> & {
        /** Derived from the entry's site_tracker — enables deep links into the tracker pages. */
        site_id?: string;
        assignee?: Pick<UserProfile, 'id' | 'name' | 'email' | 'image'> | null;
      };
    }
  >;
  upcoming_entries: Array<
    TaskEntry & {
      task_list?: Pick<TaskList, 'id' | 'name' | 'assigned_to' | 'site_tracker_id'> & {
        /** Derived from the entry's site_tracker — enables deep links into the tracker pages. */
        site_id?: string;
        assignee?: Pick<UserProfile, 'id' | 'name' | 'email' | 'image'> | null;
      };
    }
  >;
}
