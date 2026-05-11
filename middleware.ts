import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Paths that don't require authentication
 */
const publicPaths = [
  '/signin',
  '/unauthorized',
  '/api/auth',
];

/**
 * Paths that require admin role
 */
const adminPaths = [
  '/admin',
];

/**
 * Check if a path is public (doesn't require authentication)
 */
function isPublicPath(pathname: string): boolean {
  return publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

/**
 * Check if a path requires admin role
 */
function isAdminPath(pathname: string): boolean {
  return adminPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

/**
 * Middleware to protect routes
 * - Public paths: Allow access without authentication
 * - Admin paths: Require valid JWT token with admin role
 * - Protected paths: Require valid JWT token
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Skip static files and API routes (except protected ones)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Get JWT token from cookie
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });

  const isApi = pathname.startsWith('/api/');

  // No token = not authenticated
  if (!token) {
    if (isApi) {
      return NextResponse.json(
        { data: null, error: 'unauthorized', message: 'Not authenticated' },
        { status: 401 }
      );
    }
    const signInUrl = new URL('/signin', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Check admin paths require SUPER_ADMIN role
  if (isAdminPath(pathname)) {
    const userRole = token.userRole as { role?: string } | undefined;
    if (!userRole || userRole.role !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  }

  // Token exists and role check passed = allow access
  return NextResponse.next();
}

/**
 * Configure which paths the middleware should run on
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

