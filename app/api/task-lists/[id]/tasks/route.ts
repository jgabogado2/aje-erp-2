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
  siteIdForTaskList,
} from '@/lib/api/hierarchy-auth';
import { taskCreateSchema } from '@/lib/validations/task';
import { generateEntriesForTaskInDb } from '@/lib/api/task-entry-generation';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id: taskListId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForTaskList(supabase, taskListId);
    if (!siteId) return apiNotFound('Task list not found');
    if (!(await canReadAtSite(caller, siteId)).ok) return apiForbidden();

    const { data, error } = await supabase
      .from('tasks')
      .select('*, assignee:users!tasks_assigned_to_fkey(id, name, email, image)')
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

    // If assigning a user, they must have user_sites access to this site.
    // Or be a SUPER_ADMIN in the org. Defense in depth — UI also filters.
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
        assigned_to: input.assigned_to ?? null,
        frequency: input.frequency,
        skip_weekends: input.skip_weekends ?? false,
        skip_holidays: input.skip_holidays ?? false,
        is_active: true,
        display_order: displayOrder,
        created_by: caller.userId,
      })
      .select('*, assignee:users!tasks_assigned_to_fkey(id, name, email, image)')
      .single();

    if (error) throw error;
    await generateEntriesForTaskInDb(supabase, data.id as string);
    return apiSuccess(data, 201);
  } catch (err) {
    return handleUnknownError(err);
  }
}
