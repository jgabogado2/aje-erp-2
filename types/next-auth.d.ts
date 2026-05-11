import 'next-auth';
import 'next-auth/jwt';
import type { SystemRole } from '@/lib/auth.types';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    userRole?: {
      role: SystemRole;
      organization_id: string | null;
      is_active: boolean;
    };
  }

  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sub?: string;
    googleId?: string;
    picture?: string | null;
    name?: string | null;
    email?: string | null;
    userRole?: {
      role: SystemRole;
      organization_id: string | null;
      is_active: boolean;
    };
  }
}
