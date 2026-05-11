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

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteId, userId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const supabase = getSupabaseAdmin();

    // Confirm site is in caller's org.
    const { data: site } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    if (!site) return apiNotFound('Site not found in your organization');

    const { data, error } = await supabase
      .from('user_sites')
      .delete()
      .eq('site_id', siteId)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return apiNotFound('Assignment not found');
    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}
