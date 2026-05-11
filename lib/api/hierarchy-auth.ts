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
    .select('task:tasks!inner(task_list:task_lists!inner(site_tracker:site_trackers!inner(site_id)))')
    .eq('id', taskEntryId)
    .maybeSingle();
  const task = data?.task as unknown as {
    task_list?: { site_tracker?: { site_id?: string } };
  } | undefined;
  return task?.task_list?.site_tracker?.site_id ?? null;
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
