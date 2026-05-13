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
import { canReadAtSite, siteIdForSiteTracker } from '@/lib/api/hierarchy-auth';
import { trackerEntriesQuerySchema } from '@/lib/validations/tracker-view';
import { calculateSummary } from '@/lib/tracker-view';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteTrackerId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForSiteTracker(supabase, siteTrackerId);
    if (!siteId) return apiNotFound('Site tracker not found');
    if (!(await canReadAtSite(caller, siteId)).ok) return apiForbidden();

    const query = trackerEntriesQuerySchema.parse({
      year: req.nextUrl.searchParams.get('year') ?? undefined,
      assignee: req.nextUrl.searchParams.get('assignee') ?? undefined,
      status: req.nextUrl.searchParams.get('status') ?? undefined,
      task_list_id: req.nextUrl.searchParams.get('task_list_id') ?? undefined,
      search: req.nextUrl.searchParams.get('search') ?? undefined,
    });

    const trackerResult = await supabase
      .from('site_trackers')
      .select(`
        *,
        tracker_category:tracker_categories!inner(*),
        site:sites!inner(id, code, name, organization_id)
      `)
      .eq('id', siteTrackerId)
      .maybeSingle();
    if (trackerResult.error) throw trackerResult.error;
    if (!trackerResult.data) return apiNotFound('Site tracker not found');

    const [sectionsResult, taskListsResult] = await Promise.all([
      supabase
        .from('tracker_sections')
        .select('*')
        .eq('site_tracker_id', siteTrackerId)
        .order('display_order', { ascending: true }),
      supabase
        .from('task_lists')
        .select('*, assignee:users!task_lists_assigned_to_fkey(id, name, email, image)')
        .eq('site_tracker_id', siteTrackerId)
        .order('display_order', { ascending: true }),
    ]);
    if (sectionsResult.error) throw sectionsResult.error;
    if (taskListsResult.error) throw taskListsResult.error;

    let taskLists = taskListsResult.data ?? [];
    if (query.task_list_id) {
      taskLists = taskLists.filter((taskList) => taskList.id === query.task_list_id);
    }
    if (query.assignee) {
      taskLists = taskLists.filter((taskList) => taskList.assigned_to === query.assignee);
    }
    if (query.search) {
      const term = query.search.toLowerCase();
      taskLists = taskLists.filter((taskList) =>
        String(taskList.name ?? '').toLowerCase().includes(term)
      );
    }
    const taskListIds = taskLists.map((taskList) => taskList.id as string);

    let tasks: unknown[] = [];
    if (taskListIds.length > 0) {
      const tasksResult = await supabase
        .from('tasks')
        .select('*')
        .in('task_list_id', taskListIds)
        .order('display_order', { ascending: true });
      if (tasksResult.error) throw tasksResult.error;
      tasks = tasksResult.data ?? [];
    }

    let entries: unknown[] = [];
    if (taskListIds.length > 0) {
      let entriesQuery = supabase
        .from('task_entries')
        .select('*, marker:users!task_entries_marked_by_fkey(id, name, email, image)')
        .in('task_list_id', taskListIds)
        .order('period_date', { ascending: true })
        .order('period_label', { ascending: true });
      if (query.status) entriesQuery = entriesQuery.eq('status', query.status);
      const entriesResult = await entriesQuery;
      if (entriesResult.error) throw entriesResult.error;
      entries = entriesResult.data ?? [];
    }

    return apiSuccess({
      site_tracker: trackerResult.data,
      sections: sectionsResult.data ?? [],
      task_lists: taskLists,
      tasks,
      entries,
      summary: calculateSummary(entries as never),
    });
  } catch (err) {
    return handleUnknownError(err);
  }
}
