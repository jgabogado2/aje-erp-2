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
  siteIdForSiteTracker,
} from '@/lib/api/hierarchy-auth';
import { taskListCreateSchema } from '@/lib/validations/task-list';
import { generateEntriesForTaskListInDb } from '@/lib/api/task-entry-generation';
import { recordAudit } from '@/lib/api/audit';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteTrackerId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForSiteTracker(supabase, siteTrackerId);
    if (!siteId) return apiNotFound('Site tracker not found');
    if (!(await canReadAtSite(caller, siteId)).ok) return apiForbidden();

    const { data, error } = await supabase
      .from('task_lists')
      .select('*')
      .eq('site_tracker_id', siteTrackerId)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return apiSuccess(data ?? []);
  } catch (err) {
    return handleUnknownError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteTrackerId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForSiteTracker(supabase, siteTrackerId);
    if (!siteId) return apiNotFound('Site tracker not found');
    if (!(await canWriteAtSite(caller, siteId)).ok) return apiForbidden();

    const body = await req.json();
    const input = taskListCreateSchema.parse(body);

    // Optional section must belong to the same site_tracker — prevents
    // assigning a task list to a section from another tracker.
    if (input.tracker_section_id) {
      const { data: section } = await supabase
        .from('tracker_sections')
        .select('id')
        .eq('id', input.tracker_section_id)
        .eq('site_tracker_id', siteTrackerId)
        .maybeSingle();
      if (!section) return apiNotFound('Section not found in this tracker');
    }

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
        .from('task_lists')
        .select('display_order')
        .eq('site_tracker_id', siteTrackerId)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      displayOrder = (last?.display_order ?? -1) + 1;
    }

    const { data, error } = await supabase
      .from('task_lists')
      .insert({
        site_tracker_id: siteTrackerId,
        tracker_section_id: input.tracker_section_id ?? null,
        name: input.name,
        display_order: displayOrder,
        frequency: input.frequency,
        assigned_to: input.assigned_to ?? null,
        skip_weekends: input.skip_weekends ?? false,
        skip_holidays: input.skip_holidays ?? false,
        is_active: true,
        created_by: caller.userId,
      })
      .select('*, assignee:users!task_lists_assigned_to_fkey(id, name, email, image)')
      .single();

    if (error) {
      if (error.code === '23505') {
        return apiConflict(`A task list named "${input.name}" already exists`);
      }
      throw error;
    }
    await generateEntriesForTaskListInDb(supabase, data.id as string);

    await recordAudit(supabase, caller, {
      entity_type: 'task_list',
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
