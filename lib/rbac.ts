import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireAuth, requireRole, checkRole } from '@/lib/auth-server';
import { getUserRole } from '@/lib/auth-utils';
import type { SystemRole, SiteRole } from '@/lib/auth.types';

// Re-export the system-role gates so callers have one entry point.
export {
  requireAuth,
  requireRole,
  requireSuperAdmin,
  requireSiteManagerOrAbove,
  checkRole,
} from '@/lib/auth-server';

// ============================================================================
// Site-scoped permission helpers
// ============================================================================
// System role gates global capability; site role gates per-site capability.
// SUPER_ADMIN always passes site gates — they implicitly have access to all
// sites and don't need user_sites rows.

export interface SiteAccess {
  userId: string;
  siteId: string;
  /** 'SUPER_ADMIN' if granted via system role, otherwise the user_sites row's role. */
  effectiveRole: SystemRole;
  systemRole: SystemRole;
}

export async function hasSiteAccess(userId: string, siteId: string): Promise<SiteAccess | null> {
  const userRole = await getUserRole(userId);
  if (!userRole || !userRole.is_active) return null;

  if (userRole.role === 'SUPER_ADMIN') {
    return {
      userId,
      siteId,
      effectiveRole: 'SUPER_ADMIN',
      systemRole: 'SUPER_ADMIN',
    };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_sites')
    .select('role')
    .eq('user_id', userId)
    .eq('site_id', siteId)
    .limit(1)
    .single();

  if (error || !data) return null;

  return {
    userId,
    siteId,
    effectiveRole: data.role as SiteRole,
    systemRole: userRole.role,
  };
}

export async function requireSiteAccess(siteId: string): Promise<SiteAccess & { session: Awaited<ReturnType<typeof requireAuth>> }> {
  const session = await requireAuth();
  if (!session.user?.id) redirect('/unauthorized');

  const access = await hasSiteAccess(session.user.id, siteId);
  if (!access) redirect('/unauthorized');

  return { ...access, session };
}

export async function requireSiteManager(siteId: string) {
  const result = await requireSiteAccess(siteId);
  if (result.effectiveRole !== 'SUPER_ADMIN' && result.effectiveRole !== 'SITE_MANAGER') {
    redirect('/unauthorized');
  }
  return result;
}

/**
 * Lists the site IDs a user can access. SUPER_ADMIN returns null (means "all sites";
 * callers should branch on that). Anyone else returns the explicit list.
 */
export async function listAccessibleSiteIds(userId: string): Promise<string[] | null> {
  const userRole = await getUserRole(userId);
  if (!userRole || !userRole.is_active) return [];

  if (userRole.role === 'SUPER_ADMIN') return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_sites')
    .select('site_id')
    .eq('user_id', userId);

  if (error || !data) return [];
  return data.map((r) => r.site_id as string);
}
