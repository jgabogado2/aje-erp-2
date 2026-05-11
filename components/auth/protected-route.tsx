'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { SystemRole } from '@/lib/auth.types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: SystemRole[];
  fallback?: React.ReactNode;
}

/**
 * Client-side route protection. Server-side guards in middleware.ts +
 * lib/rbac.ts are the source of truth — this just smooths the UX.
 */
export function ProtectedRoute({
  children,
  requiredRoles,
  fallback,
}: ProtectedRouteProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      router.push('/signin');
      return;
    }

    if (requiredRoles && session?.userRole) {
      if (!requiredRoles.includes(session.userRole.role)) {
        router.push('/unauthorized');
        return;
      }
    }

    if (session?.userRole && !session.userRole.is_active) {
      router.push('/unauthorized');
    }
  }, [status, session, router, requiredRoles]);

  if (status === 'loading' || status === 'unauthenticated') {
    return fallback || <DefaultLoadingFallback />;
  }

  if (requiredRoles && session?.userRole) {
    if (!requiredRoles.includes(session.userRole.role)) {
      return fallback || <DefaultLoadingFallback />;
    }
  }

  return <>{children}</>;
}

function DefaultLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export function useUserRole() {
  const { data: session, status } = useSession();

  return {
    role: session?.userRole?.role ?? null,
    organizationId: session?.userRole?.organization_id ?? null,
    isActive: session?.userRole?.is_active ?? false,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
  };
}

export function useHasRole(roles: SystemRole[]) {
  const { role, isLoading, isAuthenticated } = useUserRole();

  return {
    hasRole: role ? roles.includes(role) : false,
    isLoading,
    isAuthenticated,
  };
}
