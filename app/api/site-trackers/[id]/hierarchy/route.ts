import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  handleUnknownError,
} from '@/lib/api/response';
import {
  resolveSiteReadScope,
  siteIdForSiteTracker,
} from '@/lib/api/hierarchy-auth';

type RouteContext = { params: Promise<{ id: string }> };

// Convenience: fetch the whole hierarchy in one round-trip. The UI folds
// the flat arrays into a nested view client-side.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteTrackerId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForSiteTracker(supabase, siteTrackerId);
    if (!siteId) return apiNotFound('Site tracker not found');

    const scope = await resolveSiteReadScope(caller, siteId);
    if (!scope.ok) return apiForbidden();

    // STAFF only see task lists assigned to them — the tasks below are
    // derived from this filtered set, so nothing leaks through the subtree.
    let taskListsQuery = supabase
      .from('task_lists')
      .select('*, assignee:users!task_lists_assigned_to_fkey(id, name, email, image)')
      .eq('site_tracker_id', siteTrackerId)
      .order('display_order', { ascending: true });
    if (scope.restrictToAssignee) {
      taskListsQuery = taskListsQuery.eq('assigned_to', caller.userId);
    }

    const [tracker, sections, taskLists] = await Promise.all([
      supabase
        .from('site_trackers')
        .select(`
          *,
          tracker_category:tracker_categories!inner(*),
          site:sites!inner(id, code, name, organization_id)
        `)
        .eq('id', siteTrackerId)
        .maybeSingle(),
      supabase
        .from('tracker_sections')
        .select('*')
        .eq('site_tracker_id', siteTrackerId)
        .order('display_order', { ascending: true }),
      taskListsQuery,
    ]);

    if (tracker.error) throw tracker.error;
    if (sections.error) throw sections.error;
    if (taskLists.error) throw taskLists.error;
    if (!tracker.data) return apiNotFound('Site tracker not found');

    const taskListIds = (taskLists.data ?? []).map((r) => r.id as string);
    const tasks =
      taskListIds.length > 0
        ? await supabase
            .from('tasks')
            .select('*')
            .in('task_list_id', taskListIds)
            .order('display_order', { ascending: true })
        : { data: [] as unknown[], error: null };
    if (tasks.error) throw tasks.error;

    // Verify the tracker's site matches the access check (defense in depth
    // — guards against a TOCTOU between the helper lookup and now).
    const trackerSiteId = (tracker.data.site as unknown as { id: string }).id;
    if (trackerSiteId !== siteId) return apiNotFound('Site tracker not found');

    return apiSuccess({
      site_tracker: tracker.data,
      sections: sections.data ?? [],
      task_lists: taskLists.data ?? [],
      tasks: tasks.data ?? [],
    });
  } catch (err) {
    return handleUnknownError(err);
  }
}
