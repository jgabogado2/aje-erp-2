import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import authConfig from '@/lib/auth.config';
import { getUserRole } from '@/lib/auth-utils';
import { hasRequiredRole } from '@/lib/auth.types';
import type { SystemRole } from '@/lib/auth.types';

export async function getSession() {
  return getServerSession(authConfig);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) redirect('/signin');
  return session;
}

export async function requireRole(requiredRoles: SystemRole[]) {
  const session = await requireAuth();

  if (!session.user?.id) redirect('/unauthorized');

  // Fetch fresh role from DB rather than trusting cached token.
  const userRole = await getUserRole(session.user.id);

  if (!userRole || !userRole.is_active || !hasRequiredRole(userRole.role, requiredRoles)) {
    redirect('/unauthorized');
  }

  return { session, userRole };
}

export async function requireSuperAdmin() {
  return requireRole(['SUPER_ADMIN']);
}

export async function requireSiteManagerOrAbove() {
  return requireRole(['SUPER_ADMIN', 'SITE_MANAGER']);
}

// Non-redirecting variant for conditional UI on the server.
export async function checkRole(requiredRoles: SystemRole[]) {
  const session = await getSession();
  if (!session?.user?.id) return null;

  const userRole = await getUserRole(session.user.id);
  if (!userRole || !userRole.is_active || !hasRequiredRole(userRole.role, requiredRoles)) {
    return null;
  }

  return { session, userRole };
}
