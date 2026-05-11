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
import { canReadAtSite, siteIdForTask } from '@/lib/api/hierarchy-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: taskId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForTask(supabase, taskId);
    if (!siteId) return apiNotFound('Task not found');
    if (!(await canReadAtSite(caller, siteId)).ok) return apiForbidden();

    const yearParam = req.nextUrl.searchParams.get('year');

    const [task, entries] = await Promise.all([
      supabase
        .from('tasks')
        .select(`
          *,
          assignee:users!tasks_assigned_to_fkey(id, name, email, image),
          task_list:task_lists!inner(
            id, name, site_tracker_id,
            site_tracker:site_trackers!inner(
              id, site_id, tracker_category_id, year, is_active, created_at, updated_at,
              tracker_category:tracker_categories!inner(id, name, description, frequency),
              site:sites!inner(id, code, name, organization_id)
            )
          )
        `)
        .eq('id', taskId)
        .maybeSingle(),
      supabase
        .from('task_entries')
        .select('*, marker:users!task_entries_marked_by_fkey(id, name, email, image)')
        .eq('task_id', taskId)
        .order('period_date', { ascending: true })
        .order('period_label', { ascending: true }),
    ]);

    if (task.error) throw task.error;
    if (entries.error) throw entries.error;
    if (!task.data) return apiNotFound('Task not found');

    const row = task.data as unknown as {
      task_list: { site_tracker: { year: number } };
    };
    if (yearParam && Number(yearParam) !== row.task_list.site_tracker.year) {
      return apiSuccess({ task: task.data, entries: [] });
    }

    return apiSuccess({ task: task.data, entries: entries.data ?? [] });
  } catch (err) {
    return handleUnknownError(err);
  }
}
