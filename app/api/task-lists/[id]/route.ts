import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiConflict,
  handleUnknownError,
} from '@/lib/api/response';
import {
  canReadAtSite,
  canWriteAtSite,
  siteIdForTaskList,
} from '@/lib/api/hierarchy-auth';
import { taskListUpdateSchema } from '@/lib/validations/task-list';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForTaskList(supabase, id);
    if (!siteId) return apiNotFound('Task list not found');
    if (!(await canReadAtSite(caller, siteId)).ok) return apiForbidden();

    const { data, error } = await supabase
      .from('task_lists')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiNotFound('Task list not found');
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
    const siteId = await siteIdForTaskList(supabase, id);
    if (!siteId) return apiNotFound('Task list not found');
    if (!(await canWriteAtSite(caller, siteId)).ok) return apiForbidden();

    const body = await req.json();
    const input = taskListUpdateSchema.parse(body);

    // If moving to a section, verify that section belongs to the same tracker.
    if (input.tracker_section_id) {
      const { data: tl } = await supabase
        .from('task_lists')
        .select('site_tracker_id')
        .eq('id', id)
        .maybeSingle();
      const { data: section } = await supabase
        .from('tracker_sections')
        .select('id')
        .eq('id', input.tracker_section_id)
        .eq('site_tracker_id', tl?.site_tracker_id ?? '')
        .maybeSingle();
      if (!section) return apiNotFound('Section not found in this tracker');
    }

    const { data, error } = await supabase
      .from('task_lists')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return apiConflict(`A task list named "${input.name}" already exists`);
      }
      throw error;
    }
    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}

// CASCADE on task_lists -> tasks: deleting a task list deletes its tasks
// (and in Phase 2c, those tasks' entries). The UI must warn.
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForTaskList(supabase, id);
    if (!siteId) return apiNotFound('Task list not found');
    if (!(await canWriteAtSite(caller, siteId)).ok) return apiForbidden();

    const { data, error } = await supabase
      .from('task_lists')
      .delete()
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiNotFound('Task list not found');
    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}
