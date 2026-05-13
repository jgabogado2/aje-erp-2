import { addDays, format } from 'date-fns';
import { getSupabaseAdmin } from '@/lib/supabase';
import { listCallerSiteIds, type ApiCaller } from '@/lib/api/auth';
import { calculateSummary, isEntryOverdue } from '@/lib/tracker-view';
import type { DashboardSummary, TaskEntry } from '@/types/domain';
import type { DashboardSummaryQuery } from '@/lib/validations/dashboard';
import type { TaskStatus } from '@/lib/tracker.types';

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export async function getDashboardReportData(
  supabase: SupabaseAdmin,
  caller: ApiCaller,
  query: DashboardSummaryQuery
): Promise<{ data: DashboardSummary; forbidden: boolean }> {
  const callerSiteIds = await listCallerSiteIds(caller);
  if (query.site_id && callerSiteIds && !callerSiteIds.includes(query.site_id)) {
    return { data: emptyDashboardSummary(), forbidden: true };
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
      .eq('year', query.year ?? new Date().getFullYear());
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

  let taskLists: Array<{
    id: string;
    name: string;
    assigned_to: string | null;
    assignee?: { id: string; name: string | null; email: string; image: string | null } | null;
  }> = [];
  if (taskListIds.length > 0) {
    let taskListsQuery = supabase
      .from('task_lists')
      .select('id, name, assigned_to, assignee:users!task_lists_assigned_to_fkey(id, name, email, image)')
      .in('id', taskListIds);
    if (caller.systemRole === 'STAFF') {
      taskListsQuery = taskListsQuery.eq('assigned_to', caller.userId);
    }
    const { data, error } = await taskListsQuery;
    if (error) throw error;
    taskLists = ((data ?? []) as unknown as typeof taskLists).map((taskList) => ({
      ...taskList,
      assignee: Array.isArray(taskList.assignee)
        ? taskList.assignee[0] ?? null
        : taskList.assignee,
    }));
  }

  const filteredTaskListIds = taskLists.map((taskList) => taskList.id);
  let entries: Array<TaskEntry & { task_list?: (typeof taskLists)[number] }> = [];
  if (filteredTaskListIds.length > 0) {
    const { data, error } = await supabase
      .from('task_entries')
      .select('*')
      .in('task_list_id', filteredTaskListIds)
      .order('due_date', { ascending: true });
    if (error) throw error;
    const taskListById = new Map(taskLists.map((taskList) => [taskList.id, taskList]));
    entries = ((data ?? []) as TaskEntry[]).map((entry) => ({
      ...entry,
      task_list: taskListById.get(entry.task_list_id),
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
    const taskList = entry.task_list;
    const userId = taskList?.assigned_to ?? 'unassigned';
    if (!byAssignee.has(userId)) {
      byAssignee.set(userId, {
        user_id: userId,
        name: taskList?.assignee?.name ?? taskList?.assignee?.email ?? 'Unassigned',
        entries: [],
      });
    }
    byAssignee.get(userId)!.entries.push(entry);
  }

  return {
    forbidden: false,
    data: {
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
    },
  };
}

function emptyDashboardSummary(): DashboardSummary {
  return {
    sites_count: 0,
    users_count: 0,
    entries_total: 0,
    overdue_count: 0,
    due_next_7_days: 0,
    completion_rate: 0,
    by_status: [],
    by_site: [],
    by_assignee: [],
    overdue_entries: [],
    upcoming_entries: [],
  };
}
