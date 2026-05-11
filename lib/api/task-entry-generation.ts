import type { SupabaseClient } from '@supabase/supabase-js';
import { generateEntriesForTask, todayInManila } from '@/lib/task-engine';
import type { Frequency } from '@/lib/tracker.types';

interface TaskGenerationContext {
  task: {
    id: string;
    frequency: Frequency;
    skip_weekends: boolean;
    skip_holidays: boolean;
  };
  year: number;
  organizationId: string;
}

type SupabaseAdmin = SupabaseClient;

export async function getTaskGenerationContext(
  supabase: SupabaseAdmin,
  taskId: string
): Promise<TaskGenerationContext | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id, frequency, skip_weekends, skip_holidays,
      task_list:task_lists!inner(
        site_tracker:site_trackers!inner(
          year,
          site:sites!inner(organization_id)
        )
      )
    `)
    .eq('id', taskId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    frequency: Frequency;
    skip_weekends: boolean;
    skip_holidays: boolean;
    task_list: {
      site_tracker: {
        year: number;
        site: { organization_id: string };
      };
    };
  };

  return {
    task: {
      id: row.id,
      frequency: row.frequency,
      skip_weekends: row.skip_weekends,
      skip_holidays: row.skip_holidays,
    },
    year: row.task_list.site_tracker.year,
    organizationId: row.task_list.site_tracker.site.organization_id,
  };
}

export async function generateEntriesForTaskInDb(
  supabase: SupabaseAdmin,
  taskId: string,
  options: { fromDate?: string } = {}
) {
  const context = await getTaskGenerationContext(supabase, taskId);
  if (!context) return { inserted: 0 };

  const { data: holidays, error: holidaysError } = await supabase
    .from('holidays')
    .select('date, is_recurring')
    .eq('organization_id', context.organizationId);
  if (holidaysError) throw holidaysError;

  const drafts = generateEntriesForTask(
    context.task,
    context.year,
    (holidays ?? []) as { date: string; is_recurring: boolean }[]
  ).filter((entry) => !options.fromDate || entry.period_date >= options.fromDate);

  if (drafts.length === 0) return { inserted: 0 };

  const { error } = await supabase.from('task_entries').upsert(drafts, {
    onConflict: 'task_id,period_date,period_label',
    ignoreDuplicates: true,
  });
  if (error) throw error;

  return { inserted: drafts.length };
}

export async function regenerateFutureEntriesForTask(
  supabase: SupabaseAdmin,
  taskId: string,
  fromDate: string = todayInManila()
) {
  const { error: deleteError } = await supabase
    .from('task_entries')
    .delete()
    .eq('task_id', taskId)
    .gte('period_date', fromDate);
  if (deleteError) throw deleteError;

  return generateEntriesForTaskInDb(supabase, taskId, { fromDate });
}
