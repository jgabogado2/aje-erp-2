import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import authConfig from '@/lib/auth.config';
import { getUserRole } from '@/lib/auth-utils';
import { hasRequiredRole } from '@/lib/auth.types';

/**
 * Get the current session on the server
 * Returns null if not authenticated
 */
export async function getSession() {
  return getServerSession(authConfig);
}

/**
 * Require authentication - redirects to sign-in if not authenticated
 * Use in Server Components or Server Actions
 */
export async function requireAuth() {
  const session = await getSession();

  if (!session) {
    redirect('/signin');
  }

  return session;
}

/**
 * Require specific role(s) - redirects to unauthorized if role doesn't match
 * Use in Server Components or Server Actions
 *
 * @param requiredRoles - Array of roles that are allowed access
 * @returns Session and user role if authorized
 */
export async function requireRole(
  requiredRoles: ('admin' | 'manager' | 'user')[]
) {
  const session = await requireAuth();

  if (!session.user?.id) {
    redirect('/unauthorized');
  }

  // Fetch fresh role from database (don't rely solely on cached token role)
  const userRole = await getUserRole(session.user.id);

  if (!userRole || !hasRequiredRole(userRole.role, requiredRoles)) {
    redirect('/unauthorized');
  }

  return { session, userRole };
}

/**
 * Require admin role
 */
export async function requireAdmin() {
  return requireRole(['admin']);
}

/**
 * Require admin or manager role
 */
export async function requireManager() {
  return requireRole(['admin', 'manager']);
}

/**
 * Check if current user has specific role(s) without redirecting
 * Returns null if not authenticated or role check fails
 */
export async function checkRole(requiredRoles: ('admin' | 'manager' | 'user')[]) {
  const session = await getSession();

  if (!session?.user?.id) {
    return null;
  }

  const userRole = await getUserRole(session.user.id);

  if (!userRole || !hasRequiredRole(userRole.role, requiredRoles)) {
    return null;
  }

  return { session, userRole };
}

/**
 * Get company ID from session
 * Returns null if user has no company or session is invalid
 */
export async function getCompanyIdFromSession(): Promise<string | null> {
  try {
    const session = await getSession();

    if (!session?.userRole?.company_id) {
      return null;
    }

    return session.userRole.company_id;
  } catch (error) {
    console.error('Error getting company ID from session:', error);
    return null;
  }
}

/**
 * Require company ID - redirects to unauthorized if missing
 */
export async function requireCompanyId(): Promise<string> {
  const companyId = await getCompanyIdFromSession();

  if (!companyId) {
    redirect('/unauthorized');
  }

  return companyId;
}

