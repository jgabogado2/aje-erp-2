import { describe, it, expect } from 'vitest';
import {
  generateEntriesForTaskItem,
  checkCutoff,
  getCurrentPeriod,
  todayInManila,
  type TaskEngineItem,
  type HolidayInput,
} from '@/lib/task-engine';

// 2026 is a common (non-leap) year — 365 days. Jan 1 2026 is a Thursday.
const YEAR = 2026;

function item(overrides: Partial<TaskEngineItem> = {}): TaskEngineItem {
  return { id: 'tl-1', frequency: 'MONTHLY', ...overrides };
}

describe('generateEntriesForTaskItem — MONTHLY', () => {
  const entries = generateEntriesForTaskItem(item({ frequency: 'MONTHLY' }), YEAR, []);

  it('produces exactly 12 entries', () => {
    expect(entries).toHaveLength(12);
  });

  it('labels each entry with the full month name', () => {
    expect(entries.map((e) => e.period_label)).toEqual([
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]);
  });

  it('sets period_date to the first of the month and due_date to month-end', () => {
    expect(entries[0].period_date).toBe('2026-01-01');
    expect(entries[0].due_date).toBe('2026-01-31');
    expect(entries[1].due_date).toBe('2026-02-28'); // 2026 not a leap year
  });

  it('stamps the task_list_id and an empty subtask_completions array', () => {
    expect(entries[0].task_list_id).toBe('tl-1');
    expect(entries[0].subtask_completions).toEqual([]);
    expect(entries[0].status).toBe('NOT_DONE');
    expect(entries[0].bir_status).toBeNull();
  });
});

describe('generateEntriesForTaskItem — QUARTERLY', () => {
  const entries = generateEntriesForTaskItem(item({ frequency: 'QUARTERLY' }), YEAR, []);

  it('produces 4 entries labelled 1Q..4Q', () => {
    expect(entries.map((e) => e.period_label)).toEqual(['1Q', '2Q', '3Q', '4Q']);
  });

  it('anchors each quarter to the first day of Jan/Apr/Jul/Oct', () => {
    expect(entries.map((e) => e.period_date)).toEqual([
      '2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01',
    ]);
  });

  it('sets due_date to the quarter end', () => {
    expect(entries[0].due_date).toBe('2026-03-31');
    expect(entries[3].due_date).toBe('2026-12-31');
  });
});

describe('generateEntriesForTaskItem — ANNUAL', () => {
  const entries = generateEntriesForTaskItem(item({ frequency: 'ANNUAL' }), YEAR, []);

  it('produces a single entry for the year', () => {
    expect(entries).toHaveLength(1);
    expect(entries[0].period_label).toBe('2026');
    expect(entries[0].period_date).toBe('2026-01-01');
    expect(entries[0].due_date).toBe('2026-12-31');
  });
});

describe('generateEntriesForTaskItem — BIR (hybrid)', () => {
  const entries = generateEntriesForTaskItem(item({ frequency: 'BIR' }), YEAR, []);

  it('produces 12 entries: 8 monthly + 4 quarterly', () => {
    expect(entries).toHaveLength(12);
    const quarterly = entries.filter((e) => /^[1-4]Q$/.test(e.period_label));
    expect(quarterly).toHaveLength(4);
    expect(quarterly.map((e) => e.period_label)).toEqual(['1Q', '2Q', '3Q', '4Q']);
  });

  it('excludes the quarter-closing months — no Mar/Jun/Sep/Dec monthly entry', () => {
    const monthly = entries
      .filter((e) => !/^[1-4]Q$/.test(e.period_label))
      .map((e) => e.period_label);
    expect(monthly).toEqual([
      'January', 'February', 'April', 'May',
      'July', 'August', 'October', 'November',
    ]);
  });

  it('seeds every BIR entry with bir_status NO_SUBMISSION', () => {
    expect(entries.every((e) => e.bir_status === 'NO_SUBMISSION')).toBe(true);
  });

  it('places quarterly period_dates in the closing month of each quarter', () => {
    const quarterly = entries.filter((e) => /^[1-4]Q$/.test(e.period_label));
    expect(quarterly.map((e) => e.period_date)).toEqual([
      '2026-03-01', '2026-06-01', '2026-09-01', '2026-12-01',
    ]);
  });
});

describe('generateEntriesForTaskItem — CUSTOM', () => {
  it('generates nothing — custom trackers are managed by hand', () => {
    expect(generateEntriesForTaskItem(item({ frequency: 'CUSTOM' }), YEAR, [])).toEqual([]);
  });
});

describe('generateEntriesForTaskItem — DAILY', () => {
  it('produces one entry per calendar day with no skip rules', () => {
    const entries = generateEntriesForTaskItem(item({ frequency: 'DAILY' }), YEAR, []);
    expect(entries).toHaveLength(365); // 2026 is not a leap year
    expect(entries[0].period_date).toBe('2026-01-01');
    expect(entries.at(-1)?.period_date).toBe('2026-12-31');
  });

  it('skip_weekends drops every Saturday and Sunday', () => {
    const entries = generateEntriesForTaskItem(
      item({ frequency: 'DAILY', skip_weekends: true }),
      YEAR,
      []
    );
    const hasWeekend = entries.some((e) => {
      const day = new Date(`${e.period_date}T00:00:00Z`).getUTCDay();
      return day === 0 || day === 6;
    });
    expect(hasWeekend).toBe(false);
    // 2026 has 261 weekdays.
    expect(entries).toHaveLength(261);
  });

  it('skip_holidays drops exact-date holidays for the year', () => {
    const holidays: HolidayInput[] = [
      { date: '2026-01-01', is_recurring: false },
      { date: '2026-12-25', is_recurring: false },
    ];
    const entries = generateEntriesForTaskItem(
      item({ frequency: 'DAILY', skip_holidays: true }),
      YEAR,
      holidays
    );
    expect(entries).toHaveLength(363);
    expect(entries.some((e) => e.period_date === '2026-01-01')).toBe(false);
    expect(entries.some((e) => e.period_date === '2026-12-25')).toBe(false);
  });

  it('recurring holidays match any year by month/day', () => {
    const holidays: HolidayInput[] = [{ date: '2020-12-25', is_recurring: true }];
    const entries = generateEntriesForTaskItem(
      item({ frequency: 'DAILY', skip_holidays: true }),
      YEAR,
      holidays
    );
    // 2020-12-25 is recurring → 2026-12-25 should be skipped.
    expect(entries.some((e) => e.period_date === '2026-12-25')).toBe(false);
    expect(entries).toHaveLength(364);
  });

  it('non-recurring holidays from another year are ignored', () => {
    const holidays: HolidayInput[] = [{ date: '2025-12-25', is_recurring: false }];
    const entries = generateEntriesForTaskItem(
      item({ frequency: 'DAILY', skip_holidays: true }),
      YEAR,
      holidays
    );
    // 2025-12-25 is non-recurring and not in 2026 → no effect.
    expect(entries).toHaveLength(365);
  });

  it('skip_weekends + skip_holidays compound (a weekday holiday is dropped once)', () => {
    // 2026-01-01 is a Thursday (a weekday) — dropping it via holidays should
    // not double-count against the weekend filter.
    const entries = generateEntriesForTaskItem(
      item({ frequency: 'DAILY', skip_weekends: true, skip_holidays: true }),
      YEAR,
      [{ date: '2026-01-01', is_recurring: false }]
    );
    expect(entries).toHaveLength(260); // 261 weekdays - 1 weekday holiday
  });
});

describe('generateEntriesForTaskItem — WEEKLY', () => {
  const entries = generateEntriesForTaskItem(item({ frequency: 'WEEKLY' }), YEAR, []);

  it('produces a Monday-anchored entry for each week touching the year', () => {
    // Every period_date is a Monday.
    const allMondays = entries.every(
      (e) => new Date(`${e.period_date}T00:00:00Z`).getUTCDay() === 1
    );
    expect(allMondays).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(52);
    expect(entries.length).toBeLessThanOrEqual(53);
  });

  it('sets due_date to two days after the week end (Tuesday of the next week)', () => {
    const weekStart = new Date(`${entries[0].period_date}T00:00:00Z`);
    const due = new Date(`${entries[0].due_date}T00:00:00Z`);
    const diffDays = (due.getTime() - weekStart.getTime()) / 86_400_000;
    expect(diffDays).toBe(8); // week start + 6 (end) + 2 = +8
  });
});

describe('checkCutoff', () => {
  it('returns DONE when marked on or before Manila end-of-day of the due date', () => {
    // Due 2026-01-15. Manila EOD = 2026-01-15T15:59:59.999Z.
    const beforeCutoff = new Date('2026-01-15T15:00:00.000Z');
    expect(checkCutoff({ due_date: '2026-01-15' }, beforeCutoff)).toBe('DONE');
  });

  it('returns DONE_LATE when marked after Manila end-of-day of the due date', () => {
    const afterCutoff = new Date('2026-01-15T16:30:00.000Z');
    expect(checkCutoff({ due_date: '2026-01-15' }, afterCutoff)).toBe('DONE_LATE');
  });

  it('treats the exact cutoff millisecond as still on time', () => {
    const exact = new Date('2026-01-15T15:59:59.999Z');
    expect(checkCutoff({ due_date: '2026-01-15' }, exact)).toBe('DONE');
  });
});

describe('getCurrentPeriod', () => {
  it('returns the month for MONTHLY', () => {
    const d = new Date('2026-07-20T00:00:00Z');
    expect(getCurrentPeriod('MONTHLY', d)).toEqual({
      periodDate: '2026-07-01',
      periodLabel: 'July',
    });
  });

  it('returns the month for BIR in a non-quarter-closing month', () => {
    expect(getCurrentPeriod('BIR', new Date('2026-07-20T00:00:00Z'))).toEqual({
      periodDate: '2026-07-01',
      periodLabel: 'July',
    });
  });

  it('returns the quarter for BIR in a quarter-closing month (Mar/Jun/Sep/Dec)', () => {
    // BIR has no standalone March period — March maps to 1Q.
    expect(getCurrentPeriod('BIR', new Date('2026-03-10T00:00:00Z'))).toEqual({
      periodDate: '2026-03-01',
      periodLabel: '1Q',
    });
    expect(getCurrentPeriod('BIR', new Date('2026-12-25T00:00:00Z'))).toEqual({
      periodDate: '2026-12-01',
      periodLabel: '4Q',
    });
  });

  it('returns the quarter for QUARTERLY', () => {
    const d = new Date('2026-08-10T00:00:00Z');
    expect(getCurrentPeriod('QUARTERLY', d)).toEqual({
      periodDate: '2026-07-01',
      periodLabel: '3Q',
    });
  });

  it('returns the year for ANNUAL', () => {
    expect(getCurrentPeriod('ANNUAL', new Date('2026-05-01T00:00:00Z'))).toEqual({
      periodDate: '2026-01-01',
      periodLabel: '2026',
    });
  });

  it('returns null for CUSTOM', () => {
    expect(getCurrentPeriod('CUSTOM', new Date('2026-05-01T00:00:00Z'))).toBeNull();
  });
});

describe('todayInManila', () => {
  it('shifts a late-UTC time into the next Manila day (UTC+8)', () => {
    // 2026-01-15T20:00:00Z is already 2026-01-16 04:00 in Manila.
    expect(todayInManila(new Date('2026-01-15T20:00:00Z'))).toBe('2026-01-16');
  });

  it('keeps an early-UTC time on the same Manila day', () => {
    expect(todayInManila(new Date('2026-01-15T02:00:00Z'))).toBe('2026-01-15');
  });
});
