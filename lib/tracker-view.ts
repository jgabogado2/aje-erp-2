import { format, parseISO } from 'date-fns';
import type {
  TaskEntry,
  TaskList,
  TaskWithAssignee,
  TrackerSection,
} from '@/types/domain';
import type { BirStatus, Frequency, TaskStatus } from '@/lib/tracker.types';

export interface PeriodColumn {
  key: string;
  label: string;
  date: string;
  dueDate: string;
}

export interface TrackerRow {
  id: string;
  section: TrackerSection | null;
  taskList: TaskList;
  task: TaskWithAssignee;
  entries: TaskEntry[];
  entriesByColumn: Map<string, TaskEntry>;
}

export interface TrackerSummary {
  total: number;
  not_done: number;
  ongoing: number;
  done: number;
  done_late: number;
  overdue: number;
  completion_rate: number;
}

const BIR_ORDER = [
  'January',
  'February',
  '1Q',
  'April',
  'May',
  '2Q',
  'July',
  'August',
  '3Q',
  'October',
  'November',
  '4Q',
];

export function periodKey(entry: Pick<TaskEntry, 'period_date' | 'period_label'>) {
  return `${entry.period_date}:${entry.period_label}`;
}

export function buildPeriodColumns(
  frequency: Frequency,
  entries: TaskEntry[]
): PeriodColumn[] {
  const seen = new Map<string, PeriodColumn>();
  for (const entry of entries) {
    const key = periodKey(entry);
    if (!seen.has(key)) {
      seen.set(key, {
        key,
        label: entry.period_label,
        date: entry.period_date,
        dueDate: entry.due_date,
      });
    }
  }

  const columns = [...seen.values()];
  if (frequency === 'BIR') {
    return columns.sort((a, b) => {
      const ai = BIR_ORDER.indexOf(a.label);
      const bi = BIR_ORDER.indexOf(b.label);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.date.localeCompare(b.date);
    });
  }

  return columns.sort((a, b) => a.date.localeCompare(b.date));
}

export function groupTrackerRows(
  sections: TrackerSection[],
  taskLists: TaskList[],
  tasks: TaskWithAssignee[],
  entries: TaskEntry[]
): TrackerRow[] {
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const entriesByTask = new Map<string, TaskEntry[]>();
  for (const entry of entries) {
    if (!entriesByTask.has(entry.task_id)) entriesByTask.set(entry.task_id, []);
    entriesByTask.get(entry.task_id)!.push(entry);
  }

  const tasksByList = new Map<string, TaskWithAssignee[]>();
  for (const task of tasks) {
    if (!tasksByList.has(task.task_list_id)) tasksByList.set(task.task_list_id, []);
    tasksByList.get(task.task_list_id)!.push(task);
  }

  const rows: TrackerRow[] = [];
  for (const taskList of taskLists) {
    const section = taskList.tracker_section_id
      ? sectionById.get(taskList.tracker_section_id) ?? null
      : null;
    for (const task of tasksByList.get(taskList.id) ?? []) {
      const taskEntries = [...(entriesByTask.get(task.id) ?? [])].sort((a, b) =>
        a.period_date.localeCompare(b.period_date)
      );
      rows.push({
        id: task.id,
        section,
        taskList,
        task,
        entries: taskEntries,
        entriesByColumn: new Map(taskEntries.map((entry) => [periodKey(entry), entry])),
      });
    }
  }
  return rows;
}

export function calculateSummary(entries: TaskEntry[], now = new Date()): TrackerSummary {
  const total = entries.length;
  const not_done = entries.filter((entry) => entry.status === 'NOT_DONE').length;
  const ongoing = entries.filter((entry) => entry.status === 'ONGOING').length;
  const done = entries.filter((entry) => entry.status === 'DONE').length;
  const done_late = entries.filter((entry) => entry.status === 'DONE_LATE').length;
  const overdue = entries.filter((entry) => isEntryOverdue(entry, now)).length;
  const complete = done + done_late;

  return {
    total,
    not_done,
    ongoing,
    done,
    done_late,
    overdue,
    completion_rate: total === 0 ? 0 : Math.round((complete / total) * 100),
  };
}

export function isEntryOverdue(entry: TaskEntry, now = new Date()) {
  if (entry.status === 'DONE' || entry.status === 'DONE_LATE') return false;
  return parseISO(`${entry.due_date}T23:59:59+08:00`).getTime() < now.getTime();
}

export function formatPeriodHeader(column: PeriodColumn, frequency: Frequency) {
  if (frequency === 'DAILY') return format(parseISO(`${column.date}T00:00:00Z`), 'MMM d');
  if (frequency === 'MONTHLY') return column.label.slice(0, 3);
  return column.label;
}

export function statusTone(status: TaskStatus) {
  switch (status) {
    case 'DONE':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'DONE_LATE':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'ONGOING':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'NOT_DONE':
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

export function birStatusTone(status: BirStatus | null) {
  switch (status) {
    case 'SUBMITTED_TO_FRG':
      return 'bg-sky-100 text-sky-700 border-sky-200';
    case 'APPROVED_FOR_FILING':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'FILED_FOR_PAYMENT':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'FILED_AND_PAID':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'FILED_NO_PAYMENT':
      return 'bg-teal-100 text-teal-700 border-teal-200';
    case 'NO_SUBMISSION':
    case null:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}
