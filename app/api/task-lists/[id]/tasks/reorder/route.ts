import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiError,
  handleUnknownError,
} from '@/lib/api/response';
import { canWriteAtSite, siteIdForTaskList } from '@/lib/api/hierarchy-auth';
import { taskReorderSchema } from '@/lib/validations/task';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: taskListId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForTaskList(supabase, taskListId);
    if (!siteId) return apiNotFound('Task list not found');
    if (!(await canWriteAtSite(caller, siteId)).ok) return apiForbidden();

    const body = await req.json();
    const { ordered_ids } = taskReorderSchema.parse(body);

    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('task_list_id', taskListId);
    const ownedIds = new Set((existing ?? []).map((r) => r.id as string));

    if (
      ordered_ids.length !== ownedIds.size ||
      !ordered_ids.every((id) => ownedIds.has(id))
    ) {
      return apiError(
        'validation_error',
        'ordered_ids must include every task in this list exactly once',
        422
      );
    }

    const results = await Promise.all(
      ordered_ids.map((id, idx) =>
        supabase
          .from('tasks')
          .update({ display_order: idx })
          .eq('id', id)
          .eq('task_list_id', taskListId)
      )
    );
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) throw firstErr;

    return apiSuccess({ updated: ordered_ids.length });
  } catch (err) {
    return handleUnknownError(err);
  }
}
