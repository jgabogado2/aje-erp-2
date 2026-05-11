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
import { userSiteAssignSchema } from '@/lib/validations/user';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const access = await hasSiteAccess(caller.userId, siteId);
    if (!access) return apiForbidden();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_sites')
      .select('id, user_id, site_id, role, created_at, user:users(id, name, email, image)')
      .eq('site_id', siteId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return apiSuccess(data ?? []);
  } catch (err) {
    return handleUnknownError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const body = await req.json();
    const input = userSiteAssignSchema.parse(body);

    const supabase = getSupabaseAdmin();

    // Verify the site belongs to the caller's org.
    const { data: site } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    if (!site) return apiNotFound('Site not found in your organization');

    // Verify the target user is in the same org (via organization_members).
    const { data: member } = await supabase
      .from('organization_members')
      .select('id, user_id, organization_id')
      .eq('user_id', input.user_id)
      .eq('organization_id', caller.organizationId)
      .eq('is_active', true)
      .maybeSingle();

    if (!member) {
      return apiNotFound('User is not an active member of your organization');
    }

    const { data: existing } = await supabase
      .from('user_sites')
      .select('id')
      .eq('user_id', input.user_id)
      .eq('site_id', siteId)
      .maybeSingle();

    if (existing) return apiConflict('User is already assigned to this site');

    const { data, error } = await supabase
      .from('user_sites')
      .insert({ user_id: input.user_id, site_id: siteId, role: input.role })
      .select()
      .single();

    if (error) throw error;
    return apiSuccess(data, 201);
  } catch (err) {
    return handleUnknownError(err);
  }
}
