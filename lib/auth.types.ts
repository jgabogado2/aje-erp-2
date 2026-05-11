import type { Account, Profile, User } from 'next-auth';

/**
 * Type guard to check if account is from Google OAuth provider
 */
export function isGoogleAccount(account: Account | null | undefined): account is Account {
  return account?.provider === 'google';
}

/**
 * Type guard to check if profile is from Google OAuth and has required fields
 */
export function isGoogleProfile(
  profile: Profile | undefined
): profile is Profile & { sub: string; picture?: string } {
  return !!profile && typeof (profile as { sub?: string }).sub === 'string';
}

/**
 * Type guard to check if user has a valid ID
 */
export function hasUserId(user: User | undefined): user is User & { id: string } {
  return !!user && typeof user.id === 'string' && user.id.length > 0;
}

/**
 * Helper function to check if user has required role
 */
export function hasRequiredRole(
  userRole: 'admin' | 'manager' | 'user',
  requiredRoles: ('admin' | 'manager' | 'user')[]
): boolean {
  return requiredRoles.includes(userRole);
}

/**
 * Role hierarchy for permission checks
 * Higher index = more permissions
 */
export const ROLE_HIERARCHY: Record<'admin' | 'manager' | 'user', number> = {
  user: 1,
  manager: 2,
  admin: 3,
};

/**
 * Check if user role meets or exceeds minimum required role level
 */
export function meetsRoleLevel(
  userRole: 'admin' | 'manager' | 'user',
  minimumRole: 'admin' | 'manager' | 'user'
): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}

