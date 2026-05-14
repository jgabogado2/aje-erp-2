import { describe, it, expect } from 'vitest';
import {
  buildPeriodColumns,
  groupTrackerRows,
  calculateSummary,
  isEntryOverdue,
  periodKey,
} from '@/lib/tracker-view';
import type {
  TaskEntry,
  TaskListWithAssignee,
  TrackerSection,
  Task,
} from '@/types/domain';

// --- fixtures ---------------------------------------------------------------

function entry(overrides: Partial<TaskEntry> = {}): TaskEntry {
  return {
    id: crypto.randomUUID(),
    task_list_id: 'tl-1',
    period_date: '2026-01-01',
    period_label: 'January',
    due_date: '2026-01-31',
    submission_date: null,
    status: 'NOT_DONE',
    bir_status: null,
    value: null,
    marked_by: null,
    marked_at: null,
    note: null,
    subtask_completions: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function taskList(overrides: Partial<TaskListWithAssignee> = {}): TaskListWithAssignee {
  return {
    id: 'tl-1',
    site_tracker_id: 'st-1',
    tracker_section_id: null,
    name: 'Task item',
    display_order: 0,
    frequency: 'MONTHLY',
    assigned_to: null,
    skip_weekends: false,
    skip_holidays: false,
    is_active: true,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function section(overrides: Partial<TrackerSection> = {}): TrackerSection {
  return {
    id: 's-1',
    site_tracker_id: 'st-1',
    name: 'Section',
    display_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// --- periodKey --------------------------------------------------------------

describe('periodKey', () => {
  it('combines period_date and period_label', () => {
    expect(periodKey({ period_date: '2026-03-01', period_label: '1Q' })).toBe(
      '2026-03-01:1Q'
    );
  });
});

// --- buildPeriodColumns -----------------------------------------------------

describe('buildPeriodColumns', () => {
  it('dedupes columns across many task items sharing the same periods', () => {
    const entries = [
      entry({ period_date: '2026-01-01', period_label: 'January' }),
      entry({ period_date: '2026-01-01', period_label: 'January', task_list_id: 'tl-2' }),
      entry({ period_date: '2026-02-01', period_label: 'February' }),
    ];
    const cols = buildPeriodColumns('MONTHLY', entries);
    expect(cols).toHaveLength(2);
    expect(cols.map((c) => c.label)).toEqual(['January', 'February']);
  });

  it('sorts non-BIR columns chronologically by date', () => {
    const entries = [
      entry({ period_date: '2026-03-01', period_label: 'March' }),
      entry({ period_date: '2026-01-01', period_label: 'January' }),
      entry({ period_date: '2026-02-01', period_label: 'February' }),
    ];
    const cols = buildPeriodColumns('MONTHLY', entries);
    expect(cols.map((c) => c.label)).toEqual(['January', 'February', 'March']);
  });

  it('orders the 12 canonical BIR columns in the Jan/Feb/1Q ... Nov/4Q sequence', () => {
    // Feed the canonical labels shuffled; expect the fixed BIR layout back.
    const labels = [
      '4Q', 'January', 'July', '1Q', 'February',
      'April', 'May', '2Q', 'August', '3Q',
      'October', 'November',
    ];
    const entries = labels.map((label, i) =>
      entry({ period_label: label, period_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-01` })
    );
    const cols = buildPeriodColumns('BIR', entries);
    expect(cols.map((c) => c.label)).toEqual([
      'January', 'February', '1Q',
      'April', 'May', '2Q',
      'July', 'August', '3Q',
      'October', 'November', '4Q',
    ]);
  });

  it('defensively sorts any non-canonical BIR label to the end', () => {
    // The engine no longer emits Mar/Jun/Sep/Dec BIR entries (the quarter
    // owns those slots) so this shouldn't happen with real data. But the
    // 999-sentinel fallback in buildPeriodColumns still protects the view
    // if an unexpected label ever shows up.
    const cols = buildPeriodColumns('BIR', [
      entry({ period_label: '1Q', period_date: '2026-03-01' }),
      entry({ period_label: 'Surprise', period_date: '2026-03-15' }),
      entry({ period_label: 'January', period_date: '2026-01-01' }),
    ]);
    expect(cols.map((c) => c.label)).toEqual(['January', '1Q', 'Surprise']);
  });
});

// --- groupTrackerRows -------------------------------------------------------

describe('groupTrackerRows', () => {
  it('builds one row per task list, attaching its section, subtasks and entries', () => {
    const sec = section({ id: 's-1', name: 'Collection' });
    const tlGrouped = taskList({ id: 'tl-1', tracker_section_id: 's-1', name: 'DCR' });
    const tlUngrouped = taskList({ id: 'tl-2', tracker_section_id: null, name: 'Ad hoc' });
    const subtasks: Task[] = [
      {
        id: 'sub-1',
        task_list_id: 'tl-1',
        name: 'Prepare',
        display_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];
    const entries = [
      entry({ task_list_id: 'tl-1', period_date: '2026-02-01', period_label: 'February' }),
      entry({ task_list_id: 'tl-1', period_date: '2026-01-01', period_label: 'January' }),
      entry({ task_list_id: 'tl-2', period_date: '2026-01-01', period_label: 'January' }),
    ];

    const rows = groupTrackerRows([sec], [tlGrouped, tlUngrouped], subtasks, entries);

    expect(rows).toHaveLength(2);
    const dcr = rows.find((r) => r.taskList.id === 'tl-1')!;
    expect(dcr.section?.name).toBe('Collection');
    expect(dcr.subtasks).toHaveLength(1);
    // entries sorted by period_date ascending
    expect(dcr.entries.map((e) => e.period_label)).toEqual(['January', 'February']);
    // entriesByColumn is keyed by periodKey
    expect(dcr.entriesByColumn.get('2026-01-01:January')?.period_label).toBe('January');

    const adhoc = rows.find((r) => r.taskList.id === 'tl-2')!;
    expect(adhoc.section).toBeNull();
  });
});

// --- calculateSummary -------------------------------------------------------

describe('calculateSummary', () => {
  it('counts each status bucket and computes completion rate', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const entries = [
      entry({ status: 'DONE', due_date: '2026-01-31' }),
      entry({ status: 'DONE_LATE', due_date: '2026-02-28' }),
      entry({ status: 'ONGOING', due_date: '2026-12-31' }),
      entry({ status: 'NOT_DONE', due_date: '2026-12-31' }),
    ];
    const summary = calculateSummary(entries, now);
    expect(summary.total).toBe(4);
    expect(summary.done).toBe(1);
    expect(summary.done_late).toBe(1);
    expect(summary.ongoing).toBe(1);
    expect(summary.not_done).toBe(1);
    // complete = done + done_late = 2 of 4 = 50%
    expect(summary.completion_rate).toBe(50);
  });

  it('reports 0% completion for an empty set without dividing by zero', () => {
    const summary = calculateSummary([], new Date('2026-06-01T00:00:00Z'));
    expect(summary.total).toBe(0);
    expect(summary.completion_rate).toBe(0);
  });

  it('counts overdue entries (past due, not complete)', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const entries = [
      entry({ status: 'NOT_DONE', due_date: '2026-01-31' }), // overdue
      entry({ status: 'ONGOING', due_date: '2026-02-28' }), // overdue
      entry({ status: 'DONE', due_date: '2026-01-31' }), // complete → not overdue
      entry({ status: 'NOT_DONE', due_date: '2026-12-31' }), // future → not overdue
    ];
    expect(calculateSummary(entries, now).overdue).toBe(2);
  });
});

// --- isEntryOverdue ---------------------------------------------------------

describe('isEntryOverdue', () => {
  const now = new Date('2026-06-01T00:00:00Z');

  it('is overdue when past the Manila end of the due date and not complete', () => {
    expect(isEntryOverdue(entry({ status: 'NOT_DONE', due_date: '2026-05-31' }), now)).toBe(
      true
    );
  });

  it('is not overdue when the entry is DONE or DONE_LATE', () => {
    expect(isEntryOverdue(entry({ status: 'DONE', due_date: '2026-01-01' }), now)).toBe(false);
    expect(
      isEntryOverdue(entry({ status: 'DONE_LATE', due_date: '2026-01-01' }), now)
    ).toBe(false);
  });

  it('is not overdue when the due date is still in the future', () => {
    expect(
      isEntryOverdue(entry({ status: 'NOT_DONE', due_date: '2026-12-31' }), now)
    ).toBe(false);
  });
});
