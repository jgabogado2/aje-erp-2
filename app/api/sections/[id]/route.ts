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
  siteIdForSection,
} from '@/lib/api/hierarchy-auth';
import { sectionUpdateSchema } from '@/lib/validations/section';
import { recordAudit } from '@/lib/api/audit';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForSection(supabase, id);
    if (!siteId) return apiNotFound('Section not found');
    if (!(await canReadAtSite(caller, siteId)).ok) return apiForbidden();

    const { data, error } = await supabase
      .from('tracker_sections')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiNotFound('Section not found');
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
    const siteId = await siteIdForSection(supabase, id);
    if (!siteId) return apiNotFound('Section not found');
    if (!(await canWriteAtSite(caller, siteId)).ok) return apiForbidden();

    const body = await req.json();
    const input = sectionUpdateSchema.parse(body);

    const { data: previous } = await supabase
      .from('tracker_sections')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const { data, error } = await supabase
      .from('tracker_sections')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return apiConflict(`A section named "${input.name}" already exists`);
      }
      throw error;
    }

    await recordAudit(supabase, caller, {
      entity_type: 'tracker_section',
      entity_id: id,
      action: 'update',
      old_value: previous,
      new_value: data,
      site_id: siteId,
    });

    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}

// FK from task_lists.tracker_section_id is ON DELETE SET NULL — deleting a
// section orphans (ungroups) its task lists but doesn't destroy them.
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForSection(supabase, id);
    if (!siteId) return apiNotFound('Section not found');
    if (!(await canWriteAtSite(caller, siteId)).ok) return apiForbidden();

    const { data, error } = await supabase
      .from('tracker_sections')
      .delete()
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiNotFound('Section not found');

    await recordAudit(supabase, caller, {
      entity_type: 'tracker_section',
      entity_id: id,
      action: 'delete',
      old_value: data,
      site_id: siteId,
    });

    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}
