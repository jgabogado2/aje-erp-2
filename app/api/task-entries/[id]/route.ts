import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  handleUnknownError,
} from '@/lib/api/response';
import { canReadAtSite, siteIdForTaskEntry } from '@/lib/api/hierarchy-auth';
import { taskEntryUpdateSchema } from '@/lib/validations/task-entry';
import { checkCutoff } from '@/lib/task-engine';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForTaskEntry(supabase, id);
    if (!siteId) return apiNotFound('Task entry not found');
    if (!(await canReadAtSite(caller, siteId)).ok) return apiForbidden();

    const body = await req.json();
    const input = taskEntryUpdateSchema.parse(body);

    const { data: entry, error: entryError } = await supabase
      .from('task_entries')
      .select('id, due_date, task_list_id')
      .eq('id', id)
      .maybeSingle();
    if (entryError) throw entryError;
    if (!entry) return apiNotFound('Task entry not found');

    if (input.subtask_completions !== undefined) {
      const { data: subtasks, error: subtasksError } = await supabase
        .from('tasks')
        .select('id')
        .eq('task_list_id', entry.task_list_id);
      if (subtasksError) throw subtasksError;
      const allowed = new Set((subtasks ?? []).map((subtask) => subtask.id as string));
      if (input.subtask_completions.some((subtaskId) => !allowed.has(subtaskId))) {
        return apiNotFound('Subtask not found in this task item');
      }
    }

    const now = new Date();
    const normalizedInput = {
      ...input,
      subtask_completions: input.subtask_completions
        ? [...new Set(input.subtask_completions)]
        : input.subtask_completions,
    };

    const patch = {
      ...normalizedInput,
      status: normalizedInput.status === 'DONE' ? checkCutoff(entry, now) : normalizedInput.status,
      marked_by: caller.userId,
      marked_at: now.toISOString(),
    };

    const { data, error } = await supabase
      .from('task_entries')
      .update(patch)
      .eq('id', id)
      .select('*, marker:users!task_entries_marked_by_fkey(id, name, email, image)')
      .single();
    if (error) throw error;

    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}
