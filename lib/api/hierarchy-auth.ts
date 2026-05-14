import { getSupabaseAdmin } from '@/lib/supabase';
import { hasSiteAccess } from '@/lib/rbac';
import type { ApiCaller } from '@/lib/api/auth';

// Resolves an entity in the tracker hierarchy back to its owning site so
// the standard site-scoped RBAC helpers work. Returns null on miss; callers
// translate to 404.

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export async function siteIdForSiteTracker(
  supabase: SupabaseAdmin,
  siteTrackerId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('site_trackers')
    .select('site_id')
    .eq('id', siteTrackerId)
    .maybeSingle();
  return (data?.site_id as string) ?? null;
}

export async function siteIdForSection(
  supabase: SupabaseAdmin,
  sectionId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('tracker_sections')
    .select('site_tracker:site_trackers!inner(site_id)')
    .eq('id', sectionId)
    .maybeSingle();
  const st = data?.site_tracker as unknown as { site_id?: string } | undefined;
  return st?.site_id ?? null;
}

export async function siteIdForTaskList(
  supabase: SupabaseAdmin,
  taskListId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('task_lists')
    .select('site_tracker:site_trackers!inner(site_id)')
    .eq('id', taskListId)
    .maybeSingle();
  const st = data?.site_tracker as unknown as { site_id?: string } | undefined;
  return st?.site_id ?? null;
}

export async function siteIdForTask(
  supabase: SupabaseAdmin,
  taskId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('tasks')
    .select('task_list:task_lists!inner(site_tracker:site_trackers!inner(site_id))')
    .eq('id', taskId)
    .maybeSingle();
  const tl = data?.task_list as unknown as {
    site_tracker?: { site_id?: string };
  } | undefined;
  return tl?.site_tracker?.site_id ?? null;
}

export async function siteIdForTaskEntry(
  supabase: SupabaseAdmin,
  taskEntryId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('task_entries')
    .select('task_list:task_lists!inner(site_tracker:site_trackers!inner(site_id))')
    .eq('id', taskEntryId)
    .maybeSingle();
  const taskList = data?.task_list as unknown as {
    site_tracker?: { site_id?: string };
  } | undefined;
  return taskList?.site_tracker?.site_id ?? null;
}

// "Can this caller WRITE in this site_tracker?" — SUPER_ADMIN always;
// SITE_MANAGER on the owning site; everyone else no.
export interface SiteAccessOutcome {
  ok: boolean;
  /** Effective role on the site: 'SUPER_ADMIN' | 'SITE_MANAGER' | 'STAFF' */
  effectiveRole?: 'SUPER_ADMIN' | 'SITE_MANAGER' | 'STAFF';
}

export async function canReadAtSite(
  caller: ApiCaller,
  siteId: string
): Promise<SiteAccessOutcome> {
  const access = await hasSiteAccess(caller.userId, siteId);
  return access ? { ok: true, effectiveRole: access.effectiveRole } : { ok: false };
}

export async function canWriteAtSite(
  caller: ApiCaller,
  siteId: string
): Promise<SiteAccessOutcome> {
  const access = await hasSiteAccess(caller.userId, siteId);
  if (!access) return { ok: false };
  if (access.effectiveRole === 'STAFF') return { ok: false, effectiveRole: 'STAFF' };
  return { ok: true, effectiveRole: access.effectiveRole };
}

// ============================================================================
// Assignment-scoped reads (Staff visibility)
// ============================================================================
// Site access alone is not enough for STAFF: within a site they belong to,
// they may only see task_lists — and the tasks/entries/attachments beneath
// them — that are assigned to their own account. SUPER_ADMIN and SITE_MANAGER
// see everything in their sites. This is the query-level enforcement behind
// the UI; it holds against hand-crafted requests and URL manipulation, not
// just conditional rendering.

export interface SiteReadScope {
  ok: boolean;
  effectiveRole?: 'SUPER_ADMIN' | 'SITE_MANAGER' | 'STAFF';
  /** STAFF only: reads must be narrowed to task_lists assigned to the caller. */
  restrictToAssignee: boolean;
}

export async function resolveSiteReadScope(
  caller: ApiCaller,
  siteId: string
): Promise<SiteReadScope> {
  const access = await hasSiteAccess(caller.userId, siteId);
  if (!access) return { ok: false, restrictToAssignee: false };
  return {
    ok: true,
    effectiveRole: access.effectiveRole,
    restrictToAssignee: access.effectiveRole === 'STAFF',
  };
}

export interface EntityReadOutcome {
  ok: boolean;
  /** Owning site id — set whenever the entity resolved, even when the read is denied. */
  siteId?: string;
}

// Shared rule: given a task_list's owning site + assignee, decide if the
// caller may read it. Keeps the three resolvers below identical in behavior.
async function scopeByTaskList(
  caller: ApiCaller,
  siteId: string | null | undefined,
  assignedTo: string | null | undefined
): Promise<EntityReadOutcome> {
  if (!siteId) return { ok: false };
  const scope = await resolveSiteReadScope(caller, siteId);
  if (!scope.ok) return { ok: false, siteId };
  if (scope.restrictToAssignee && assignedTo !== caller.userId) {
    return { ok: false, siteId };
  }
  return { ok: true, siteId };
}

export async function canReadTaskList(
  supabase: SupabaseAdmin,
  caller: ApiCaller,
  taskListId: string
): Promise<EntityReadOutcome> {
  const { data } = await supabase
    .from('task_lists')
    .select('assigned_to, site_tracker:site_trackers!inner(site_id)')
    .eq('id', taskListId)
    .maybeSingle();
  if (!data) return { ok: false };
  const siteId = (data.site_tracker as unknown as { site_id?: string })?.site_id;
  return scopeByTaskList(caller, siteId, data.assigned_to as string | null);
}

export async function canReadTask(
  supabase: SupabaseAdmin,
  caller: ApiCaller,
  taskId: string
): Promise<EntityReadOutcome> {
  const { data } = await supabase
    .from('tasks')
    .select(
      'task_list:task_lists!inner(assigned_to, site_tracker:site_trackers!inner(site_id))'
    )
    .eq('id', taskId)
    .maybeSingle();
  const tl = data?.task_list as unknown as
    | { assigned_to?: string | null; site_tracker?: { site_id?: string } }
    | undefined;
  if (!tl) return { ok: false };
  return scopeByTaskList(caller, tl.site_tracker?.site_id, tl.assigned_to);
}

export async function canReadTaskEntry(
  supabase: SupabaseAdmin,
  caller: ApiCaller,
  taskEntryId: string
): Promise<EntityReadOutcome> {
  const { data } = await supabase
    .from('task_entries')
    .select(
      'task_list:task_lists!inner(assigned_to, site_tracker:site_trackers!inner(site_id))'
    )
    .eq('id', taskEntryId)
    .maybeSingle();
  const tl = data?.task_list as unknown as
    | { assigned_to?: string | null; site_tracker?: { site_id?: string } }
    | undefined;
  if (!tl) return { ok: false };
  return scopeByTaskList(caller, tl.site_tracker?.site_id, tl.assigned_to);
}
