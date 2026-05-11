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
  canReadAtSite,
  canWriteAtSite,
  siteIdForTask,
} from '@/lib/api/hierarchy-auth';
import { taskUpdateSchema } from '@/lib/validations/task';
import { regenerateFutureEntriesForTask } from '@/lib/api/task-entry-generation';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForTask(supabase, id);
    if (!siteId) return apiNotFound('Task not found');
    if (!(await canReadAtSite(caller, siteId)).ok) return apiForbidden();

    const { data, error } = await supabase
      .from('tasks')
      .select('*, assignee:users!tasks_assigned_to_fkey(id, name, email, image)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiNotFound('Task not found');
    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForTask(supabase, id);
    if (!siteId) return apiNotFound('Task not found');
    if (!(await canWriteAtSite(caller, siteId)).ok) return apiForbidden();

    const body = await req.json();
    const input = taskUpdateSchema.parse(body);
    const shouldRegenerate =
      input.frequency !== undefined ||
      input.skip_weekends !== undefined ||
      input.skip_holidays !== undefined;

    if (input.task_list_id) {
      const [{ data: currentTask }, { data: targetList }] = await Promise.all([
        supabase
          .from('tasks')
          .select('task_list:task_lists!inner(site_tracker_id)')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('task_lists')
          .select('id, site_tracker_id')
          .eq('id', input.task_list_id)
          .maybeSingle(),
      ]);
      const currentList = currentTask?.task_list as unknown as
        | { site_tracker_id?: string }
        | undefined;
      if (
        !targetList ||
        !currentList?.site_tracker_id ||
        targetList.site_tracker_id !== currentList.site_tracker_id
      ) {
        return apiNotFound('Target task list not found in this tracker');
      }
    }

    // Same assignee-validity check as create.
    if (input.assigned_to) {
      const { data: us } = await supabase
        .from('user_sites')
        .select('id')
        .eq('user_id', input.assigned_to)
        .eq('site_id', siteId)
        .maybeSingle();
      const { data: member } = await supabase
        .from('organization_members')
        .select('role')
        .eq('user_id', input.assigned_to)
        .eq('organization_id', caller.organizationId)
        .eq('is_active', true)
        .maybeSingle();
      if (!us && member?.role !== 'SUPER_ADMIN') {
        return apiNotFound('Assignee is not a member of this site');
      }
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(input)
      .eq('id', id)
      .select('*, assignee:users!tasks_assigned_to_fkey(id, name, email, image)')
      .single();
    if (error) throw error;
    if (shouldRegenerate) {
      await regenerateFutureEntriesForTask(supabase, id);
    }
    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForTask(supabase, id);
    if (!siteId) return apiNotFound('Task not found');
    if (!(await canWriteAtSite(caller, siteId)).ok) return apiForbidden();

    const { data, error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiNotFound('Task not found');
    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}
