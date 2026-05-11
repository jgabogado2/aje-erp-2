import { getServerSession } from 'next-auth';
import authConfig from '@/lib/auth.config';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserRole } from '@/lib/auth-utils';
import type { SystemRole } from '@/lib/auth.types';

export interface ApiCaller {
  userId: string;
  email: string;
  systemRole: SystemRole;
  organizationId: string;
  organizationMemberId: string;
}

// Route handlers can't call redirect(), so these helpers return null and the
// caller is expected to return apiUnauthorized()/apiForbidden() itself.
// That keeps the success/failure shape uniform in the JSON response.

export async function getApiSession() {
  return getServerSession(authConfig);
}

export async function getApiCaller(): Promise<ApiCaller | null> {
  const session = await getApiSession();
  if (!session?.user?.id || !session.user.email) return null;

  const userRole = await getUserRole(session.user.id);
  if (!userRole || !userRole.is_active || !userRole.organization_id) return null;

  // Fetch the org_members row id (used to set invited_by on writes).
  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase
    .from('organization_members')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!member) return null;

  return {
    userId: session.user.id,
    email: session.user.email,
    systemRole: userRole.role,
    organizationId: userRole.organization_id,
    organizationMemberId: member.id,
  };
}

// Convenience: list site ids this caller can access within their org.
// Returns null for SUPER_ADMIN (means "all sites in their org").
export async function listCallerSiteIds(caller: ApiCaller): Promise<string[] | null> {
  if (caller.systemRole === 'SUPER_ADMIN') return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_sites')
    .select('site_id')
    .eq('user_id', caller.userId);

  if (error || !data) return [];
  return data.map((r) => r.site_id as string);
}
