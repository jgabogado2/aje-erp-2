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

type RouteContext = { params: Promise<{ id: string }> };

// Returns the sites this user is assigned to. `id` is organization_members.id
// (the membership row), not users.id — matches the rest of the admin/users API.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const supabase = getSupabaseAdmin();

    const { data: member } = await supabase
      .from('organization_members')
      .select('id, user_id')
      .eq('id', id)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    if (!member) return apiNotFound('Member not found');
    if (!member.user_id) return apiSuccess([]);

    // Inner join via embedded select scopes the assignments to sites in the
    // caller's org. Sites outside the org never get returned.
    const { data, error } = await supabase
      .from('user_sites')
      .select(`
        id, user_id, site_id, role, created_at,
        site:sites!inner(id, code, name, organization_id, is_active)
      `)
      .eq('user_id', member.user_id)
      .eq('site.organization_id', caller.organizationId);

    if (error) throw error;
    return apiSuccess(data ?? []);
  } catch (err) {
    return handleUnknownError(err);
  }
}
