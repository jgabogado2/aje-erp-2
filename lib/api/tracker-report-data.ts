import { getSupabaseAdmin } from '@/lib/supabase';
import { trackerEntriesQuerySchema, type TrackerEntriesQuery } from '@/lib/validations/tracker-view';
import {
  buildPeriodColumns,
  calculateSummary,
  groupTrackerRows,
  type PeriodColumn,
  type TrackerRow,
} from '@/lib/tracker-view';
import type { ApiCaller } from '@/lib/api/auth';
import { canReadAtSite, siteIdForSiteTracker } from '@/lib/api/hierarchy-auth';
import type {
  SiteTracker,
  Task,
  TaskEntry,
  TaskListWithAssignee,
  TrackerCategory,
  TrackerEntriesSummary,
  TrackerSection,
  Site,
} from '@/types/domain';

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export interface TrackerReportData {
  site_tracker: SiteTracker & {
    tracker_category: TrackerCategory;
    site: Pick<Site, 'id' | 'code' | 'name' | 'organization_id'>;
  };
  sections: TrackerSection[];
  task_lists: TaskListWithAssignee[];
  tasks: Task[];
  entries: TaskEntry[];
  columns: PeriodColumn[];
  rows: TrackerRow[];
  summary: TrackerEntriesSummary;
}

export function parseTrackerReportQuery(searchParams: URLSearchParams): TrackerEntriesQuery {
  return trackerEntriesQuerySchema.parse({
    year: searchParams.get('year') ?? undefined,
    assignee: searchParams.get('assignee') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    task_list_id: searchParams.get('task_list_id') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  });
}

export async function authorizeTrackerReport(
  supabase: SupabaseAdmin,
  caller: ApiCaller,
  siteTrackerId: string
) {
  const siteId = await siteIdForSiteTracker(supabase, siteTrackerId);
  if (!siteId) return { ok: false as const, reason: 'not_found' as const };
  if (!(await canReadAtSite(caller, siteId)).ok) {
    return { ok: false as const, reason: 'forbidden' as const };
  }
  return { ok: true as const, siteId };
}

export async function getTrackerReportData(
  supabase: SupabaseAdmin,
  siteTrackerId: string,
  query: TrackerEntriesQuery
): Promise<TrackerReportData | null> {
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
  if (!trackerResult.data) return null;

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

  let taskLists = ((taskListsResult.data ?? []) as TaskListWithAssignee[]).map(
    (taskList) => ({
      ...taskList,
      assignee: Array.isArray(taskList.assignee)
        ? taskList.assignee[0] ?? null
        : taskList.assignee,
    })
  );
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

  const taskListIds = taskLists.map((taskList) => taskList.id);

  let tasks: Task[] = [];
  if (taskListIds.length > 0) {
    const tasksResult = await supabase
      .from('tasks')
      .select('*')
      .in('task_list_id', taskListIds)
      .order('display_order', { ascending: true });
    if (tasksResult.error) throw tasksResult.error;
    tasks = (tasksResult.data ?? []) as Task[];
  }

  let entries: TaskEntry[] = [];
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
    entries = (entriesResult.data ?? []) as TaskEntry[];
  }

  const siteTracker = trackerResult.data as TrackerReportData['site_tracker'];
  const sections = (sectionsResult.data ?? []) as TrackerSection[];
  const columns = buildPeriodColumns(siteTracker.tracker_category.frequency, entries);
  const rows = groupTrackerRows(sections, taskLists, tasks, entries);

  return {
    site_tracker: siteTracker,
    sections,
    task_lists: taskLists,
    tasks,
    entries,
    columns,
    rows,
    summary: calculateSummary(entries),
  };
}
