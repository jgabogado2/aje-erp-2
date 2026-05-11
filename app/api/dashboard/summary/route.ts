import { NextRequest } from 'next/server';
import { addDays, format } from 'date-fns';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller, listCallerSiteIds } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  handleUnknownError,
} from '@/lib/api/response';
import { dashboardSummaryQuerySchema } from '@/lib/validations/dashboard';
import { calculateSummary, isEntryOverdue } from '@/lib/tracker-view';
import type { TaskStatus } from '@/lib/tracker.types';
import type { TaskEntry } from '@/types/domain';

export async function GET(req: NextRequest) {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const query = dashboardSummaryQuerySchema.parse({
      site_id: req.nextUrl.searchParams.get('site_id') ?? undefined,
      year: req.nextUrl.searchParams.get('year') ?? new Date().getFullYear(),
    });

    const supabase = getSupabaseAdmin();
    const callerSiteIds = await listCallerSiteIds(caller);
    if (query.site_id && callerSiteIds && !callerSiteIds.includes(query.site_id)) {
      return apiForbidden();
    }

    let sitesQuery = supabase
      .from('sites')
      .select('id, name, is_active')
      .eq('organization_id', caller.organizationId);
    if (query.site_id) sitesQuery = sitesQuery.eq('id', query.site_id);
    else if (callerSiteIds) sitesQuery = sitesQuery.in('id', callerSiteIds);
    const { data: sites, error: sitesError } = await sitesQuery;
    if (sitesError) throw sitesError;

    const siteIds = (sites ?? []).map((site) => site.id as string);

    const { data: users, error: usersError } = await supabase
      .from('organization_members')
      .select('id, is_active')
      .eq('organization_id', caller.organizationId);
    if (usersError) throw usersError;

    let siteTrackerIds: string[] = [];
    if (siteIds.length > 0) {
      const { data, error } = await supabase
        .from('site_trackers')
        .select('id, site_id')
        .in('site_id', siteIds)
        .eq('year', query.year);
      if (error) throw error;
      siteTrackerIds = (data ?? []).map((row) => row.id as string);
    }

    let taskListIds: string[] = [];
    if (siteTrackerIds.length > 0) {
      const { data, error } = await supabase
        .from('task_lists')
        .select('id')
        .in('site_tracker_id', siteTrackerIds);
      if (error) throw error;
      taskListIds = (data ?? []).map((row) => row.id as string);
    }

    let tasks: Array<{
      id: string;
      name: string;
      assigned_to: string | null;
      assignee?: { id: string; name: string | null; email: string; image: string | null } | null;
    }> = [];
    if (taskListIds.length > 0) {
      let tasksQuery = supabase
        .from('tasks')
        .select('id, name, assigned_to, assignee:users!tasks_assigned_to_fkey(id, name, email, image)')
        .in('task_list_id', taskListIds);
      if (caller.systemRole === 'STAFF') tasksQuery = tasksQuery.eq('assigned_to', caller.userId);
      const { data, error } = await tasksQuery;
      if (error) throw error;
      tasks = ((data ?? []) as unknown as typeof tasks).map((task) => ({
        ...task,
        assignee: Array.isArray(task.assignee) ? task.assignee[0] ?? null : task.assignee,
      }));
    }

    const taskIds = tasks.map((task) => task.id);
    let entries: Array<TaskEntry & { task?: (typeof tasks)[number] }> = [];
    if (taskIds.length > 0) {
      const { data, error } = await supabase
        .from('task_entries')
        .select('*')
        .in('task_id', taskIds)
        .order('due_date', { ascending: true });
      if (error) throw error;
      const taskById = new Map(tasks.map((task) => [task.id, task]));
      entries = ((data ?? []) as TaskEntry[]).map((entry) => ({
        ...entry,
        task: taskById.get(entry.task_id),
      }));
    }

    const summary = calculateSummary(entries as never);
    const today = format(new Date(), 'yyyy-MM-dd');
    const nextWeek = format(addDays(new Date(), 7), 'yyyy-MM-dd');
    const byStatus = new Map<TaskStatus, number>([
      ['NOT_DONE', 0],
      ['ONGOING', 0],
      ['DONE', 0],
      ['DONE_LATE', 0],
    ]);
    for (const entry of entries) byStatus.set(entry.status, (byStatus.get(entry.status) ?? 0) + 1);

    const byAssignee = new Map<
      string,
      { user_id: string; name: string; entries: typeof entries }
    >();
    for (const entry of entries) {
      const task = entry.task;
      const userId = task?.assigned_to ?? 'unassigned';
      if (!byAssignee.has(userId)) {
        byAssignee.set(userId, {
          user_id: userId,
          name: task?.assignee?.name ?? task?.assignee?.email ?? 'Unassigned',
          entries: [],
        });
      }
      byAssignee.get(userId)!.entries.push(entry);
    }

    return apiSuccess({
      sites_count: sites?.length ?? 0,
      users_count: users?.length ?? 0,
      entries_total: entries.length,
      overdue_count: summary.overdue,
      due_next_7_days: entries.filter(
        (entry) => entry.due_date >= today && entry.due_date <= nextWeek
      ).length,
      completion_rate: summary.completion_rate,
      by_status: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
      by_site: (sites ?? []).map((site) => ({
        site_id: site.id as string,
        site_name: site.name as string,
        completion_rate: summary.completion_rate,
      })),
      by_assignee: [...byAssignee.values()].map((group) => {
        const groupSummary = calculateSummary(group.entries as never);
        return {
          user_id: group.user_id,
          name: group.name,
          overdue_count: group.entries.filter((entry) => isEntryOverdue(entry as never)).length,
          completion_rate: groupSummary.completion_rate,
        };
      }),
      overdue_entries: entries.filter((entry) => isEntryOverdue(entry as never)).slice(0, 8),
      upcoming_entries: entries
        .filter((entry) => entry.due_date >= today && entry.due_date <= nextWeek)
        .slice(0, 8),
    });
  } catch (err) {
    return handleUnknownError(err);
  }
}
