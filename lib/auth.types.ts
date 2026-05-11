import type { Account, Profile, User } from 'next-auth';

// ============================================================================
// Role types — single source of truth
// ============================================================================
// System role: granted by organization_members. Drives global auth gates.
// Site role: granted by user_sites. Drives per-site auth gates.

export type SystemRole = 'SUPER_ADMIN' | 'SITE_MANAGER' | 'STAFF';
export type SiteRole = 'SITE_MANAGER' | 'STAFF';

export const SYSTEM_ROLES = ['SUPER_ADMIN', 'SITE_MANAGER', 'STAFF'] as const;
export const SITE_ROLES = ['SITE_MANAGER', 'STAFF'] as const;

// Higher number = more privilege.
export const ROLE_HIERARCHY: Record<SystemRole, number> = {
  STAFF: 1,
  SITE_MANAGER: 2,
  SUPER_ADMIN: 3,
};

export function hasRequiredRole(
  userRole: SystemRole,
  requiredRoles: SystemRole[]
): boolean {
  return requiredRoles.includes(userRole);
}

export function meetsRoleLevel(
  userRole: SystemRole,
  minimumRole: SystemRole
): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}

// ============================================================================
// NextAuth type guards (unchanged)
// ============================================================================

export function isGoogleAccount(account: Account | null | undefined): account is Account {
  return account?.provider === 'google';
}

export function isGoogleProfile(
  profile: Profile | undefined
): profile is Profile & { sub: string; picture?: string } {
  return !!profile && typeof (profile as { sub?: string }).sub === 'string';
}

export function hasUserId(user: User | undefined): user is User & { id: string } {
  return !!user && typeof user.id === 'string' && user.id.length > 0;
}
