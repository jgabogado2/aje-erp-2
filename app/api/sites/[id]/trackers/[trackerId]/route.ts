import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import { hasSiteAccess } from '@/lib/rbac';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  handleUnknownError,
} from '@/lib/api/response';
import { siteTrackerUpdateSchema } from '@/lib/validations/tracker';

type RouteContext = { params: Promise<{ id: string; trackerId: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteId, trackerId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const access = await hasSiteAccess(caller.userId, siteId);
    if (!access) return apiForbidden();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('site_trackers')
      .select(`
        *,
        tracker_category:tracker_categories!inner(*),
        site:sites!inner(id, code, name, organization_id)
      `)
      .eq('id', trackerId)
      .eq('site_id', siteId)
      .eq('site.organization_id', caller.organizationId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return apiNotFound('Site tracker not found');
    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteId, trackerId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const body = await req.json();
    const input = siteTrackerUpdateSchema.parse(body);

    const supabase = getSupabaseAdmin();

    // Verify site_tracker exists and is in caller's org via the site join.
    const { data: current } = await supabase
      .from('site_trackers')
      .select('id, site:sites!inner(organization_id)')
      .eq('id', trackerId)
      .eq('site_id', siteId)
      .maybeSingle();

    if (!current || (current.site as unknown as { organization_id: string }).organization_id !== caller.organizationId) {
      return apiNotFound('Site tracker not found');
    }

    const { data, error } = await supabase
      .from('site_trackers')
      .update(input)
      .eq('id', trackerId)
      .select()
      .single();

    if (error) throw error;
    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}

// Hard delete. site_trackers will RESTRICT once Phase 2b adds child tables
// (sections, task_lists). For now there are no children so this is safe.
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteId, trackerId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const supabase = getSupabaseAdmin();

    // Org check via the site relation.
    const { data: site } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    if (!site) return apiNotFound('Site not found in your organization');

    const { data, error } = await supabase
      .from('site_trackers')
      .delete()
      .eq('id', trackerId)
      .eq('site_id', siteId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return apiNotFound('Site tracker not found');
    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}
