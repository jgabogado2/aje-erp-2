// Per-frequency UI configuration for the operational tracker system.
// One grid engine + one list engine + one drawer + one chip set, all driven
// by the config returned here — so every tracker type stays cohesive while
// adapting layout, density, KPI cards, and status vocabulary to its cadence.

import type { ComponentType } from 'react';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileWarning,
  ListTodo,
  ShieldCheck,
} from 'lucide-react';
import type { Frequency } from '@/lib/tracker.types';
import type { TaskEntry, TrackerEntriesSummary } from '@/types/domain';
import { isEntryOverdue } from '@/lib/tracker-view';

export type TrackerLayout = 'grid' | 'list';
export type ColumnGrouping = 'none' | 'month' | 'quarter';
export type JumpNav = 'month' | 'quarter' | null;

/** Inputs available to a KPI card's metric — everything is client-derivable. */
export interface KpiContext {
  summary: TrackerEntriesSummary;
  entries: TaskEntry[];
  now: Date;
}

export interface KpiCardSpec {
  /** Filter key. `'all'` clears the active filter; any other key activates it. */
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  compute: (ctx: KpiContext) => { value: string | number; detail: string };
  /** When this card is active, rows keep only entries matching this predicate. */
  entryFilter?: (entry: TaskEntry, now: Date) => boolean;
}

export interface FrequencyConfig {
  /** `grid` for cadences with many periods; `list` for ANNUAL (one period). */
  layout: TrackerLayout;
  columnGrouping: ColumnGrouping;
  rowHeight: number;
  jumpNav: JumpNav;
  statusVocabulary: 'task' | 'bir';
  /** BIR: float overdue rows to the top and tint them as escalated. */
  escalation: boolean;
  kpiCards: KpiCardSpec[];
}

// --- shared entry predicates -------------------------------------------------

const FILED_STATUSES = ['FILED_AND_PAID', 'FILED_NO_PAYMENT'];

const isComplete = (e: TaskEntry) => e.status === 'DONE' || e.status === 'DONE_LATE';
const isFiled = (e: TaskEntry) => !!e.bir_status && FILED_STATUSES.includes(e.bir_status);
const isMissingSubmission = (e: TaskEntry) =>
  !e.bir_status || e.bir_status === 'NO_SUBMISSION';

function daysUntilDue(dueDate: string, now: Date) {
  const due = parseISO(`${dueDate}T23:59:59+08:00`).getTime();
  return Math.floor((due - now.getTime()) / 86_400_000);
}

function dueWithin(days: number) {
  return (entry: TaskEntry, now: Date) => {
    if (isComplete(entry)) return false;
    const delta = daysUntilDue(entry.due_date, now);
    return delta >= 0 && delta <= days;
  };
}

// --- reusable KPI cards ------------------------------------------------------

const completionCard: KpiCardSpec = {
  key: 'all',
  label: 'Completion',
  icon: CheckCircle2,
  compute: ({ summary }) => ({
    value: `${summary.completion_rate}%`,
    detail: `${summary.done + summary.done_late} of ${summary.total} complete`,
  }),
};

const openCard: KpiCardSpec = {
  key: 'NOT_DONE',
  label: 'Open',
  icon: ListTodo,
  compute: ({ summary }) => ({ value: summary.not_done, detail: `${summary.ongoing} ongoing` }),
  entryFilter: (e) => e.status === 'NOT_DONE',
};

const lateDoneCard: KpiCardSpec = {
  key: 'DONE_LATE',
  label: 'Late done',
  icon: Clock3,
  compute: ({ summary }) => ({ value: summary.done_late, detail: 'Completed after cutoff' }),
  entryFilter: (e) => e.status === 'DONE_LATE',
};

const overdueCard: KpiCardSpec = {
  key: 'overdue',
  label: 'Overdue',
  icon: AlertTriangle,
  compute: ({ summary }) => ({ value: summary.overdue, detail: 'Still not complete' }),
  entryFilter: (e, now) => isEntryOverdue(e, now),
};

const dueTodayCard: KpiCardSpec = {
  key: 'due_today',
  label: 'Due today',
  icon: CalendarClock,
  compute: ({ entries, now }) => {
    const today = format(now, 'yyyy-MM-dd');
    const count = entries.filter((e) => e.period_date === today && !isComplete(e)).length;
    return { value: count, detail: "Today's items still open" };
  },
  entryFilter: (e, now) => e.period_date === format(now, 'yyyy-MM-dd') && !isComplete(e),
};

function dueWithinCard(days: number): KpiCardSpec {
  const matches = dueWithin(days);
  return {
    key: `due_${days}d`,
    label: `Due next ${days}d`,
    icon: CalendarClock,
    compute: ({ entries, now }) => ({
      value: entries.filter((e) => matches(e, now)).length,
      detail: 'Approaching deadline',
    }),
    entryFilter: matches,
  };
}

// --- BIR-specific KPI cards --------------------------------------------------

const complianceScoreCard: KpiCardSpec = {
  key: 'all',
  label: 'Compliance score',
  icon: ShieldCheck,
  compute: ({ entries }) => {
    const filed = entries.filter(isFiled).length;
    const pct = entries.length ? Math.round((filed / entries.length) * 100) : 0;
    return { value: `${pct}%`, detail: `${filed} of ${entries.length} filed` };
  },
};

const filedReturnsCard: KpiCardSpec = {
  key: 'bir_filed',
  label: 'Filed returns',
  icon: FileCheck2,
  compute: ({ entries }) => ({
    value: entries.filter(isFiled).length,
    detail: 'Submitted to BIR',
  }),
  entryFilter: isFiled,
};

const missingSubmissionsCard: KpiCardSpec = {
  key: 'bir_missing',
  label: 'Missing submissions',
  icon: FileWarning,
  compute: ({ entries }) => ({
    value: entries.filter(isMissingSubmission).length,
    detail: 'No submission yet',
  }),
  entryFilter: isMissingSubmission,
};

const atRiskCard: KpiCardSpec = {
  key: 'overdue',
  label: 'At risk',
  icon: AlertTriangle,
  compute: ({ summary }) => ({ value: summary.overdue, detail: 'Overdue — penalty risk' }),
  entryFilter: (e, now) => isEntryOverdue(e, now),
};

// --- frequency → config ------------------------------------------------------

const TASK_DEFAULT_CARDS: KpiCardSpec[] = [completionCard, openCard, overdueCard, lateDoneCard];

export function getFrequencyConfig(frequency: Frequency): FrequencyConfig {
  switch (frequency) {
    case 'DAILY':
      return {
        layout: 'grid',
        columnGrouping: 'month',
        rowHeight: 56,
        jumpNav: 'month',
        statusVocabulary: 'task',
        escalation: false,
        kpiCards: [completionCard, dueTodayCard, overdueCard, lateDoneCard],
      };
    case 'WEEKLY':
      return {
        layout: 'grid',
        columnGrouping: 'month',
        rowHeight: 56,
        jumpNav: 'month',
        statusVocabulary: 'task',
        escalation: false,
        kpiCards: [completionCard, openCard, overdueCard, dueWithinCard(7)],
      };
    case 'MONTHLY':
      return {
        layout: 'grid',
        columnGrouping: 'quarter',
        rowHeight: 72,
        jumpNav: 'quarter',
        statusVocabulary: 'task',
        escalation: false,
        kpiCards: [completionCard, openCard, overdueCard, dueWithinCard(30)],
      };
    case 'QUARTERLY':
      return {
        layout: 'grid',
        columnGrouping: 'none',
        rowHeight: 80,
        jumpNav: null,
        statusVocabulary: 'task',
        escalation: false,
        kpiCards: TASK_DEFAULT_CARDS,
      };
    case 'ANNUAL':
      return {
        layout: 'list',
        columnGrouping: 'none',
        rowHeight: 72,
        jumpNav: null,
        statusVocabulary: 'task',
        escalation: false,
        kpiCards: TASK_DEFAULT_CARDS,
      };
    case 'BIR':
      return {
        layout: 'grid',
        columnGrouping: 'quarter',
        rowHeight: 72,
        jumpNav: 'quarter',
        statusVocabulary: 'bir',
        escalation: true,
        kpiCards: [complianceScoreCard, filedReturnsCard, missingSubmissionsCard, atRiskCard],
      };
    case 'CUSTOM':
    default:
      return {
        layout: 'grid',
        columnGrouping: 'none',
        rowHeight: 72,
        jumpNav: null,
        statusVocabulary: 'task',
        escalation: false,
        kpiCards: TASK_DEFAULT_CARDS,
      };
  }
}
