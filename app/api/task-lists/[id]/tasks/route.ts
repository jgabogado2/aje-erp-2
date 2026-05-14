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
import {
  canReadTaskList,
  canWriteAtSite,
  siteIdForTaskList,
} from '@/lib/api/hierarchy-auth';
import { taskCreateSchema } from '@/lib/validations/task';
import { recordAudit } from '@/lib/api/audit';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id: taskListId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    // STAFF may only read subtasks of task lists assigned to them.
    const access = await canReadTaskList(supabase, caller, taskListId);
    if (!access.siteId) return apiNotFound('Task list not found');
    if (!access.ok) return apiForbidden();

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('task_list_id', taskListId)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return apiSuccess(data ?? []);
  } catch (err) {
    return handleUnknownError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: taskListId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForTaskList(supabase, taskListId);
    if (!siteId) return apiNotFound('Task list not found');
    if (!(await canWriteAtSite(caller, siteId)).ok) return apiForbidden();

    const body = await req.json();
    const input = taskCreateSchema.parse(body);

    let displayOrder = input.display_order ?? 0;
    if (input.display_order === undefined) {
      const { data: last } = await supabase
        .from('tasks')
        .select('display_order')
        .eq('task_list_id', taskListId)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      displayOrder = (last?.display_order ?? -1) + 1;
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        task_list_id: taskListId,
        name: input.name,
        display_order: displayOrder,
      })
      .select('*')
      .single();

    if (error) throw error;

    await recordAudit(supabase, caller, {
      entity_type: 'task',
      entity_id: data.id as string,
      action: 'create',
      new_value: data,
      site_id: siteId,
    });

    return apiSuccess(data, 201);
  } catch (err) {
    return handleUnknownError(err);
  }
}
