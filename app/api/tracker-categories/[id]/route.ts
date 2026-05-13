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
import { trackerCategoryUpdateSchema } from '@/lib/validations/tracker';
import { recordAudit } from '@/lib/api/audit';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('tracker_categories')
      .select('*')
      .eq('id', id)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return apiNotFound('Tracker category not found');
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
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const body = await req.json();
    const input = trackerCategoryUpdateSchema.parse(body);

    const supabase = getSupabaseAdmin();

    const { data: current } = await supabase
      .from('tracker_categories')
      .select('*')
      .eq('id', id)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    if (!current) return apiNotFound('Tracker category not found');

    if (input.name && input.name.toLowerCase() !== current.name.toLowerCase()) {
      const { data: clash } = await supabase
        .from('tracker_categories')
        .select('id')
        .eq('organization_id', caller.organizationId)
        .ilike('name', input.name)
        .neq('id', id)
        .maybeSingle();
      if (clash) {
        return apiConflict(`A tracker category named "${input.name}" already exists`);
      }
    }

    // Block frequency changes on a category that already has site_trackers —
    // they'd reference templates that no longer match the schema. PATCH a new
    // category instead.
    if (input.frequency && input.frequency !== current.frequency) {
      const { count } = await supabase
        .from('site_trackers')
        .select('id', { count: 'exact', head: true })
        .eq('tracker_category_id', id);
      if ((count ?? 0) > 0) {
        return apiConflict(
          'This category is already assigned to one or more sites; frequency cannot be changed. Create a new category instead.'
        );
      }
    }

    const { data, error } = await supabase
      .from('tracker_categories')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await recordAudit(supabase, caller, {
      entity_type: 'tracker_category',
      entity_id: id,
      action: 'update',
      old_value: current,
      new_value: data,
    });

    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}

// Hard delete. RESTRICT on site_trackers means this returns a 409 if the
// category is in use; callers should deactivate instead.
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const supabase = getSupabaseAdmin();

    const { count } = await supabase
      .from('site_trackers')
      .select('id', { count: 'exact', head: true })
      .eq('tracker_category_id', id);

    if ((count ?? 0) > 0) {
      return apiConflict(
        'This category is assigned to one or more sites; deactivate it instead, or unassign first.'
      );
    }

    const { data, error } = await supabase
      .from('tracker_categories')
      .delete()
      .eq('id', id)
      .eq('organization_id', caller.organizationId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return apiNotFound('Tracker category not found');

    await recordAudit(supabase, caller, {
      entity_type: 'tracker_category',
      entity_id: id,
      action: 'delete',
      old_value: data,
    });

    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}
