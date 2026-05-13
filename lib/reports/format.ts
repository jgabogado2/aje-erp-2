import { formatPeriodHeader, type PeriodColumn } from '@/lib/tracker-view';
import type { Frequency, TaskStatus } from '@/lib/tracker.types';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_DONE: 'Not done',
  ONGOING: 'Ongoing',
  DONE: 'Done',
  DONE_LATE: 'Done late',
};

export const STATUS_HEX: Record<TaskStatus, string> = {
  NOT_DONE: 'E5E7EB',
  ONGOING: 'BFDBFE',
  DONE: 'BBF7D0',
  DONE_LATE: 'FED7AA',
};

export function periodHeader(column: PeriodColumn, frequency: Frequency) {
  return formatPeriodHeader(column, frequency);
}

export function safeFilePart(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'report';
}

export function safeWorksheetName(value: string, fallback: string) {
  const base = (value || fallback)
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
  return base || fallback.slice(0, 31);
}

export function uniqueWorksheetName(
  desiredName: string,
  used: Set<string>,
  fallback: string
) {
  const base = safeWorksheetName(desiredName, fallback);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  for (let i = 2; i < 100; i += 1) {
    const suffix = ` ${i}`;
    const next = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
  }

  return fallback.slice(0, 31);
}

export function timestampForFilename(date = new Date()) {
  return date.toISOString().slice(0, 19).replace(/[-:T]/g, '');
}
