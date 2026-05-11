import {
  addDays,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  startOfQuarter,
} from 'date-fns';
import type { BirStatus, Frequency, TaskStatus } from '@/lib/tracker.types';

export const MANILA_TIME_ZONE = 'Asia/Manila';

export interface TaskEngineTask {
  id?: string;
  frequency: Frequency;
  skip_weekends?: boolean | null;
  skip_holidays?: boolean | null;
}

export interface HolidayInput {
  date: string;
  is_recurring?: boolean | null;
}

export interface TaskEntryDraft {
  task_id?: string;
  period_date: string;
  period_label: string;
  due_date: string;
  submission_date: string | null;
  status: TaskStatus;
  bir_status: BirStatus | null;
  value: string | null;
  note: string | null;
}

export function generateEntriesForTask(
  task: TaskEngineTask,
  year: number,
  holidays: HolidayInput[]
): TaskEntryDraft[] {
  switch (task.frequency) {
    case 'DAILY':
      return generateDaily(task, year, holidays);
    case 'WEEKLY':
      return generateWeekly(task, year);
    case 'MONTHLY':
      return generateMonthly(task, year);
    case 'QUARTERLY':
      return generateQuarterly(task, year);
    case 'ANNUAL':
      return [draft(task, dateOnly(utcDate(year, 0, 1)), String(year), dateOnly(endOfYear(utcDate(year, 0, 1))))];
    case 'BIR':
      return [...generateMonthly(task, year), ...generateBirQuarterly(task, year)];
    case 'CUSTOM':
      return [];
  }
}

export function checkCutoff(entry: { due_date: string }, now: Date = new Date()): TaskStatus {
  return now.getTime() > manilaEndOfDayUtc(entry.due_date).getTime()
    ? 'DONE_LATE'
    : 'DONE';
}

export function getCurrentPeriod(
  frequency: Frequency,
  date: Date = new Date()
): { periodDate: string; periodLabel: string } | null {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  if (frequency === 'DAILY') {
    return { periodDate: dateOnly(date), periodLabel: format(date, 'MMM d, yyyy') };
  }
  if (frequency === 'MONTHLY' || frequency === 'BIR') {
    const first = utcDate(year, month, 1);
    return { periodDate: dateOnly(first), periodLabel: format(first, 'MMMM') };
  }
  if (frequency === 'QUARTERLY') {
    const start = startOfQuarter(date);
    const quarter = Math.floor(start.getUTCMonth() / 3) + 1;
    return { periodDate: dateOnly(start), periodLabel: `${quarter}Q` };
  }
  if (frequency === 'ANNUAL') {
    return { periodDate: `${year}-01-01`, periodLabel: String(year) };
  }
  if (frequency === 'WEEKLY') {
    const start = startOfWeekMonday(date);
    return {
      periodDate: dateOnly(start),
      periodLabel: `Week ${weekNumberWithinYear(start, year)} (${format(start, 'MMM d')})`,
    };
  }
  return null;
}

export function todayInManila(now: Date = new Date()): string {
  const manila = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return manila.toISOString().slice(0, 10);
}

function generateDaily(
  task: TaskEngineTask,
  year: number,
  holidays: HolidayInput[]
): TaskEntryDraft[] {
  const result: TaskEntryDraft[] = [];
  const holidaySet = buildHolidaySet(holidays, year);
  let cursor = utcDate(year, 0, 1);
  const end = utcDate(year, 11, 31);

  while (cursor <= end) {
    const iso = dateOnly(cursor);
    const day = cursor.getUTCDay();
    const isWeekend = day === 0 || day === 6;
    if (!(task.skip_weekends && isWeekend) && !(task.skip_holidays && holidaySet.has(iso))) {
      result.push(draft(task, iso, format(cursor, 'MMM d, yyyy'), iso));
    }
    cursor = addDays(cursor, 1);
  }

  return result;
}

function generateWeekly(task: TaskEngineTask, year: number): TaskEntryDraft[] {
  const result: TaskEntryDraft[] = [];
  let weekStart = startOfWeekMonday(utcDate(year, 0, 1));
  const yearEnd = utcDate(year, 11, 31);
  let week = 1;

  while (weekStart <= yearEnd) {
    const weekEnd = addDays(weekStart, 6);
    const dueDate = addDays(weekEnd, 2);
    result.push(
      draft(
        task,
        dateOnly(weekStart),
        `Week ${week} (${format(weekStart, 'MMM d')})`,
        dateOnly(dueDate)
      )
    );
    weekStart = addDays(weekStart, 7);
    week += 1;
  }

  return result;
}

function generateMonthly(task: TaskEngineTask, year: number): TaskEntryDraft[] {
  return Array.from({ length: 12 }, (_, month) => {
    const start = utcDate(year, month, 1);
    return draft(task, dateOnly(start), format(start, 'MMMM'), dateOnly(endOfMonth(start)));
  });
}

function generateQuarterly(task: TaskEngineTask, year: number): TaskEntryDraft[] {
  return [0, 3, 6, 9].map((month, idx) => {
    const start = utcDate(year, month, 1);
    return draft(task, dateOnly(start), `${idx + 1}Q`, dateOnly(endOfQuarter(start)));
  });
}

function generateBirQuarterly(task: TaskEngineTask, year: number): TaskEntryDraft[] {
  return [2, 5, 8, 11].map((month, idx) => {
    const period = utcDate(year, month, 1);
    const quarterStart = utcDate(year, month - 2, 1);
    return draft(task, dateOnly(period), `${idx + 1}Q`, dateOnly(endOfQuarter(quarterStart)));
  });
}

function draft(
  task: TaskEngineTask,
  periodDate: string,
  periodLabel: string,
  dueDate: string
): TaskEntryDraft {
  return {
    task_id: task.id,
    period_date: periodDate,
    period_label: periodLabel,
    due_date: dueDate,
    submission_date: null,
    status: 'NOT_DONE',
    bir_status: task.frequency === 'BIR' ? 'NO_SUBMISSION' : null,
    value: null,
    note: null,
  };
}

function buildHolidaySet(holidays: HolidayInput[], year: number): Set<string> {
  const set = new Set<string>();
  for (const holiday of holidays) {
    const [, month, day] = holiday.date.split('-');
    if (!month || !day) continue;
    if (holiday.is_recurring) {
      set.add(`${year}-${month}-${day}`);
    } else if (holiday.date.startsWith(`${year}-`)) {
      set.add(holiday.date);
    }
  }
  return set;
}

function manilaEndOfDayUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 15, 59, 59, 999));
}

function startOfWeekMonday(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()), diff);
}

function weekNumberWithinYear(weekStart: Date, year: number): number {
  const first = startOfWeekMonday(utcDate(year, 0, 1));
  return Math.floor((weekStart.getTime() - first.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
