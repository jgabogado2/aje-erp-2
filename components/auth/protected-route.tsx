'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: ('admin' | 'manager' | 'user')[];
  fallback?: React.ReactNode;
}

/**
 * Client-side route protection component
 * Redirects to sign-in if not authenticated
 * Redirects to unauthorized if role check fails
 *
 * Note: Server-side protection should be used as the primary guard.
 * This component provides UX protection and loading states.
 */
export function ProtectedRoute({
  children,
  requiredRoles,
  fallback,
}: ProtectedRouteProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Wait for session to load
    if (status === 'loading') return;

    // Not authenticated - redirect to sign-in
    if (status === 'unauthenticated') {
      router.push('/signin');
      return;
    }

    // Check role requirements
    if (requiredRoles && session?.userRole) {
      const userRole = session.userRole.role;
      if (!requiredRoles.includes(userRole)) {
        router.push('/unauthorized');
        return;
      }
    }

    // Check if user is active
    if (session?.userRole && !session.userRole.is_active) {
      router.push('/unauthorized');
      return;
    }
  }, [status, session, router, requiredRoles]);

  // Loading state
  if (status === 'loading') {
    return fallback || <DefaultLoadingFallback />;
  }

  // Not authenticated
  if (status === 'unauthenticated') {
    return fallback || <DefaultLoadingFallback />;
  }

  // Role check (client-side)
  if (requiredRoles && session?.userRole) {
    const userRole = session.userRole.role;
    if (!requiredRoles.includes(userRole)) {
      return fallback || <DefaultLoadingFallback />;
    }
  }

  return <>{children}</>;
}

/**
 * Default loading fallback component
 */
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

/**
 * Hook to get current user's role
 */
export function useUserRole() {
  const { data: session, status } = useSession();

  return {
    role: session?.userRole?.role ?? null,
    companyId: session?.userRole?.company_id ?? null,
    isActive: session?.userRole?.is_active ?? false,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
  };
}

/**
 * Hook to check if user has specific role(s)
 */
export function useHasRole(roles: ('admin' | 'manager' | 'user')[]) {
  const { role, isLoading, isAuthenticated } = useUserRole();

  return {
    hasRole: role ? roles.includes(role) : false,
    isLoading,
    isAuthenticated,
  };
}

