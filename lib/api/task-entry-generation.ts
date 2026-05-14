import type { SupabaseClient } from '@supabase/supabase-js';
import { generateEntriesForTaskItem, todayInManila } from '@/lib/task-engine';
import type { Frequency } from '@/lib/tracker.types';

// After migration 007, entries are generated PER task_list ("task item"),
// not per task. This module is the DB-side bridge between the pure engine
// in lib/task-engine.ts and the live Supabase tables.

interface TaskItemGenerationContext {
  taskList: {
    id: string;
    frequency: Frequency;
    skip_weekends: boolean;
    skip_holidays: boolean;
  };
  year: number;
  organizationId: string;
}

type SupabaseAdmin = SupabaseClient;

export async function getTaskItemGenerationContext(
  supabase: SupabaseAdmin,
  taskListId: string
): Promise<TaskItemGenerationContext | null> {
  const { data, error } = await supabase
    .from('task_lists')
    .select(`
      id, frequency, skip_weekends, skip_holidays,
      site_tracker:site_trackers!inner(
        year,
        site:sites!inner(organization_id)
      )
    `)
    .eq('id', taskListId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    frequency: Frequency;
    skip_weekends: boolean;
    skip_holidays: boolean;
    site_tracker: {
      year: number;
      site: { organization_id: string };
    };
  };

  return {
    taskList: {
      id: row.id,
      frequency: row.frequency,
      skip_weekends: row.skip_weekends,
      skip_holidays: row.skip_holidays,
    },
    year: row.site_tracker.year,
    organizationId: row.site_tracker.site.organization_id,
  };
}

export async function generateEntriesForTaskListInDb(
  supabase: SupabaseAdmin,
  taskListId: string,
  options: { fromDate?: string } = {}
) {
  const context = await getTaskItemGenerationContext(supabase, taskListId);
  if (!context) return { inserted: 0 };

  const { data: holidays, error: holidaysError } = await supabase
    .from('holidays')
    .select('date, is_recurring')
    .eq('organization_id', context.organizationId);
  if (holidaysError) throw holidaysError;

  // Cutoff compares against due_date, not period_date: a period can start in
  // the past while still being current/future (an ANNUAL period starts Jan 1
  // but is due Dec 31). Filtering on period_date would drop it entirely.
  const drafts = generateEntriesForTaskItem(
    context.taskList,
    context.year,
    (holidays ?? []) as { date: string; is_recurring: boolean }[]
  ).filter((entry) => !options.fromDate || entry.due_date >= options.fromDate);

  if (drafts.length === 0) return { inserted: 0 };

  const { error } = await supabase.from('task_entries').upsert(drafts, {
    onConflict: 'task_list_id,period_date,period_label',
    ignoreDuplicates: true,
  });
  if (error) throw error;

  return { inserted: drafts.length };
}

interface PristineCheckRow {
  id: string;
  status: string;
  note: string | null;
  submission_date: string | null;
  value: string | null;
  marked_by: string | null;
  bir_status: string | null;
  subtask_completions: unknown;
}

/**
 * A pristine entry is one the engine created and no user has since touched —
 * default status, no note/submission/value, not marked, no real BIR status,
 * no completed subtasks. Only these are safe to delete on regeneration.
 */
function isPristineEntry(entry: PristineCheckRow): boolean {
  const completions = Array.isArray(entry.subtask_completions)
    ? entry.subtask_completions
    : [];
  return (
    entry.status === 'NOT_DONE' &&
    entry.note === null &&
    entry.submission_date === null &&
    entry.value === null &&
    entry.marked_by === null &&
    (entry.bir_status === null || entry.bir_status === 'NO_SUBMISSION') &&
    completions.length === 0
  );
}

export async function regenerateFutureEntriesForTaskList(
  supabase: SupabaseAdmin,
  taskListId: string,
  fromDate: string = todayInManila()
) {
  // Only delete *pristine* future entries. An entry a user has touched (status,
  // note, submission, value, BIR status, completed subtask) or attached a file
  // to carries real work and must survive regeneration — deleting it would also
  // cascade-delete its attachments. Cutoff is due_date, mirroring the draft
  // filter in generateEntriesForTaskListInDb.
  const { data: futureEntries, error: fetchError } = await supabase
    .from('task_entries')
    .select(
      'id, status, note, submission_date, value, marked_by, bir_status, subtask_completions'
    )
    .eq('task_list_id', taskListId)
    .gte('due_date', fromDate);
  if (fetchError) throw fetchError;

  const rows = (futureEntries ?? []) as PristineCheckRow[];
  const futureIds = rows.map((e) => e.id);

  let entryIdsWithAttachments = new Set<string>();
  if (futureIds.length > 0) {
    const { data: attachments, error: attachmentsError } = await supabase
      .from('attachments')
      .select('task_entry_id')
      .in('task_entry_id', futureIds);
    if (attachmentsError) throw attachmentsError;
    entryIdsWithAttachments = new Set(
      (attachments ?? []).map((a) => (a as { task_entry_id: string }).task_entry_id)
    );
  }

  const pristineIds = rows
    .filter((e) => isPristineEntry(e) && !entryIdsWithAttachments.has(e.id))
    .map((e) => e.id);

  if (pristineIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('task_entries')
      .delete()
      .in('id', pristineIds);
    if (deleteError) throw deleteError;
  }

  return generateEntriesForTaskListInDb(supabase, taskListId, { fromDate });
}

// Back-compat aliases so older import sites compile until they're updated.
export const generateEntriesForTaskInDb = generateEntriesForTaskListInDb;
export const regenerateFutureEntriesForTask = regenerateFutureEntriesForTaskList;
