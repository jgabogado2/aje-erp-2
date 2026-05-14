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
import { canReadTaskList } from '@/lib/api/hierarchy-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: taskListId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    // STAFF may only read entries on task lists assigned to them.
    const access = await canReadTaskList(supabase, caller, taskListId);
    if (!access.siteId) return apiNotFound('Task item not found');
    if (!access.ok) return apiForbidden();

    const yearParam = req.nextUrl.searchParams.get('year');

    const [taskList, subtasks, entries] = await Promise.all([
      supabase
        .from('task_lists')
        .select(`
          *,
          assignee:users!task_lists_assigned_to_fkey(id, name, email, image),
          site_tracker:site_trackers!inner(
            id, site_id, tracker_category_id, year, is_active, created_at, updated_at,
            tracker_category:tracker_categories!inner(id, name, description, frequency),
            site:sites!inner(id, code, name, organization_id)
          )
        `)
        .eq('id', taskListId)
        .maybeSingle(),
      supabase
        .from('tasks')
        .select('*')
        .eq('task_list_id', taskListId)
        .order('display_order', { ascending: true }),
      supabase
        .from('task_entries')
        .select('*, marker:users!task_entries_marked_by_fkey(id, name, email, image)')
        .eq('task_list_id', taskListId)
        .order('period_date', { ascending: true })
        .order('period_label', { ascending: true }),
    ]);

    if (taskList.error) throw taskList.error;
    if (subtasks.error) throw subtasks.error;
    if (entries.error) throw entries.error;
    if (!taskList.data) return apiNotFound('Task item not found');

    const row = taskList.data as unknown as {
      site_tracker: { year: number };
    };
    const taskListWithSubtasks = {
      ...taskList.data,
      subtasks: subtasks.data ?? [],
    };
    if (yearParam && Number(yearParam) !== row.site_tracker.year) {
      return apiSuccess({ task_list: taskListWithSubtasks, entries: [] });
    }

    return apiSuccess({ task_list: taskListWithSubtasks, entries: entries.data ?? [] });
  } catch (err) {
    return handleUnknownError(err);
  }
}
