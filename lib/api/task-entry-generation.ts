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

  const drafts = generateEntriesForTaskItem(
    context.taskList,
    context.year,
    (holidays ?? []) as { date: string; is_recurring: boolean }[]
  ).filter((entry) => !options.fromDate || entry.period_date >= options.fromDate);

  if (drafts.length === 0) return { inserted: 0 };

  const { error } = await supabase.from('task_entries').upsert(drafts, {
    onConflict: 'task_list_id,period_date,period_label',
    ignoreDuplicates: true,
  });
  if (error) throw error;

  return { inserted: drafts.length };
}

export async function regenerateFutureEntriesForTaskList(
  supabase: SupabaseAdmin,
  taskListId: string,
  fromDate: string = todayInManila()
) {
  const { error: deleteError } = await supabase
    .from('task_entries')
    .delete()
    .eq('task_list_id', taskListId)
    .gte('period_date', fromDate);
  if (deleteError) throw deleteError;

  return generateEntriesForTaskListInDb(supabase, taskListId, { fromDate });
}

// Back-compat aliases so older import sites compile until they're updated.
export const generateEntriesForTaskInDb = generateEntriesForTaskListInDb;
export const regenerateFutureEntriesForTask = regenerateFutureEntriesForTaskList;
