import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import { hasSiteAccess } from '@/lib/rbac';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiConflict,
  handleUnknownError,
} from '@/lib/api/response';
import { siteUpdateSchema } from '@/lib/validations/site';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const access = await hasSiteAccess(caller.userId, id);
    if (!access) return apiForbidden();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .eq('id', id)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return apiNotFound('Site not found');
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
    const input = siteUpdateSchema.parse(body);

    const supabase = getSupabaseAdmin();

    // Make sure the target lives inside the caller's org before touching it.
    const { data: current } = await supabase
      .from('sites')
      .select('id, code')
      .eq('id', id)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    if (!current) return apiNotFound('Site not found');

    if (input.code && input.code !== current.code) {
      const { data: clash } = await supabase
        .from('sites')
        .select('id')
        .eq('organization_id', caller.organizationId)
        .ilike('code', input.code)
        .neq('id', id)
        .limit(1)
        .maybeSingle();
      if (clash) return apiConflict(`A site with code "${input.code}" already exists`);
    }

    const { data, error } = await supabase
      .from('sites')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}

// Hard delete. user_sites cascades. When Phase 2 adds trackers/tasks with
// ON DELETE RESTRICT, this will start returning a 409 for sites with children
// — at which point the caller should deactivate first (PATCH is_active=false).
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('sites')
      .delete()
      .eq('id', id)
      .eq('organization_id', caller.organizationId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return apiNotFound('Site not found');
    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}
