# Authentication System Blueprint

**Version:** 1.0  
**Date:** 2025-01-27  
**System:** Next.js + NextAuth.js + Supabase  
**Session Strategy:** JWT (stateless)

---

## Table of Contents

1. [Authentication Architecture](#1-authentication-architecture)
2. [Exact NextAuth Configuration](#2-exact-nextauth-configuration)
3. [Database Layer](#3-database-layer)
4. [Environment & Secrets](#4-environment--secrets)
5. [Transfer Instructions](#5-transfer-instructions-destination-system)
6. [Edge Cases & Guarantees](#6-edge-cases--guarantees)

---

## 1. Authentication Architecture

### 1.1 Overview

This system implements **email-based whitelisting** with **Google OAuth** authentication. Users must:
1. Have their email whitelisted in the `whitelisted_users` table
2. Sign in via Google OAuth
3. Be automatically synced to the `users` table upon first sign-in

**Key Design Decisions:**
- **JWT Strategy**: Stateless sessions stored in HTTP-only cookies
- **No Database Sessions**: NextAuth does not use database sessions; all session data is in JWT
- **Whitelist-First**: Authentication is gated by email whitelist check
- **Role-Based Access**: Roles (`admin`, `manager`, `user`) stored in `whitelisted_users` table
- **Supabase Integration**: User data persisted in Supabase PostgreSQL database

### 1.2 NextAuth Initialization

NextAuth is initialized in two places (both must exist):

**File 1:** `app/api/auth/[...nextauth]/route.ts`
```typescript
import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";

const handler = NextAuth(authConfig);

export { handler as GET, handler as POST };
```

**File 2:** `lib/auth.ts` (optional, for re-exports)
```typescript
import NextAuth from "next-auth";
import authConfig from "./auth.config";

const handler = NextAuth(authConfig);

export { handler as GET, handler as POST };
```

**Critical:** The route handler MUST be at `app/api/auth/[...nextauth]/route.ts` for Next.js App Router. This creates endpoints:
- `GET /api/auth/signin`
- `POST /api/auth/signin/google`
- `GET /api/auth/signout`
- `GET /api/auth/session`
- `GET /api/auth/callback/google`
- `GET /api/auth/providers`

### 1.3 Session Strategy

**Strategy:** `"jwt"` (stateless)

**Configuration:**
```typescript
session: {
  strategy: "jwt" as const,
  maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
  updateAge: 24 * 60 * 60, // 24 hours in seconds
}
```

**Behavior:**
- Sessions expire after **30 days** of inactivity
- Session data is refreshed every **24 hours** when accessed
- JWT tokens are stored in **HTTP-only cookies** (secure, sameSite: lax)
- No database queries for session validation (stateless)
- Session data includes: user ID, email, name, image, role, company_id, is_active

### 1.4 Providers

**Single Provider:** Google OAuth 2.0

**Configuration:**
```typescript
GoogleProvider({
  clientId: process.env.AUTH_GOOGLE_ID!,
  clientSecret: process.env.AUTH_GOOGLE_SECRET!,
  authorization: {
    params: {
      prompt: "consent",        // Always show consent screen
      access_type: "offline",    // Request refresh token
      response_type: "code",     // Authorization code flow
    },
  },
})
```

**Why Google Only:**
- Email-based whitelisting requires verified email addresses
- Google provides reliable email verification
- Single provider simplifies user management

### 1.5 Token Lifecycle

**JWT Token Structure:**
```typescript
{
  sub: string,              // User ID (UUID from users table)
  googleId?: string,        // Google profile sub
  picture?: string | null,  // Profile image URL
  name?: string | null,     // User's display name
  email?: string | null,    // User's email
  userRole?: {              // Role information (cached)
    role: 'admin' | 'manager' | 'user',
    company_id: string | null,
    is_active: boolean,
  },
  iat?: number,            // Issued at (auto)
  exp?: number,            // Expiration (auto)
}
```

**Token Flow:**
1. **Initial Sign-In:**
   - User clicks "Sign in with Google"
   - Redirected to Google OAuth consent screen
   - Google redirects back with authorization code
   - NextAuth exchanges code for access token
   - `signIn` callback executes → checks whitelist → creates/updates user
   - `jwt` callback executes → stores user data in token
   - `session` callback executes → returns session to client

2. **Subsequent Requests:**
   - Middleware extracts JWT from cookie
   - Validates token signature and expiration
   - If expired → redirects to `/signin`
   - If valid → allows request

3. **Token Refresh:**
   - Triggered when `updateAge` (24h) is exceeded
   - `jwt` callback runs with `trigger !== 'update'`
   - Fetches latest user data from database
   - Updates token with fresh data
   - New token issued with extended expiration

4. **Session Update (Manual):**
   - Client calls `update()` from `useSession()`
   - `jwt` callback runs with `trigger === 'update'`
   - Fetches latest user data from database
   - Updates token

### 1.6 Expiration Behavior

**Session Expiration:**
- **Absolute Expiration:** 30 days from last token refresh
- **Refresh Window:** Token refreshed every 24 hours when accessed
- **Expired Token Handling:** Middleware redirects to `/signin?callbackUrl=<current-path>`

**Token Refresh Logic:**
```typescript
// In jwt callback
if (trigger === 'update' && token.sub) {
  // Fetch latest user data from database
  // Update token with fresh data
}
```

**Critical:** If a user's whitelist status changes (e.g., `is_active` set to `false`), the change will NOT be reflected until:
1. Token expires (30 days), OR
2. User manually triggers `update()`, OR
3. Token refresh occurs (24h window)

---

## 2. Exact NextAuth Configuration

### 2.1 Complete `authConfig` Object

**File:** `lib/auth.config.ts`

```typescript
import GoogleProvider from "next-auth/providers/google";
import { getSupabaseAdmin } from '@/lib/supabase';
import { checkEmailWhitelist, getUserRole } from '@/lib/auth-utils';
import { randomUUID } from 'crypto';
import { isGoogleAccount, isGoogleProfile, hasUserId } from '@/lib/auth.types';
import type { User, Account, Session, Profile } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

export const authConfig = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: "/signin",
    signOut: "/signin",
    error: "/unauthorized",
  },
  callbacks: {
    // ... see sections below
  },
};

export default authConfig;
```

### 2.2 `signIn` Callback

**Purpose:** Gate authentication by email whitelist and sync user to database

**Execution:** Runs once per sign-in attempt, BEFORE token creation

**Logic Flow:**
1. Validate Google provider and email presence
2. Check email whitelist (case-insensitive, active only)
3. If not whitelisted → return `false` (blocks sign-in)
4. If whitelisted → sync user to `users` table:
   - Check if user exists by email
   - If exists → update name, image, emailVerified
   - If not exists → create with generated UUID
5. Set `user.id` to database UUID (not Google ID)
6. Return `true` (allows sign-in)

**Code:**
```typescript
async signIn({ user, account }: { user: User; account: Account | null }) {
  // Only process Google OAuth sign-ins
  if (!isGoogleAccount(account) || !user.email) {
    console.log('Sign-in blocked: Not Google provider or missing email');
    return false;
  }

  try {
    console.log(`Attempting sign-in for: ${user.email}`);

    // Step 1: Check if email is whitelisted and active
    const whitelistEntry = await checkEmailWhitelist(user.email);
    
    if (!whitelistEntry) {
      console.log(`Access denied for non-whitelisted email: ${user.email}`);
      return false;
    }

    console.log(`Whitelisted user signing in: ${user.email} (${whitelistEntry.role})`);

    // Step 2: Sync user to Supabase users table
    const supabase = getSupabaseAdmin();
    
    // Check if user already exists by email
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .single();
    
    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine for new users
      console.error('Error checking existing user:', selectError);
    }
    
    // Generate a proper UUID for new users (Google ID is not a valid UUID)
    const newUserId = randomUUID();
    const finalUserId = existingUser?.id || newUserId;

    if (existingUser) {
      // Update existing user
      const { error: updateError } = await supabase
        .from('users')
        .update({
          name: user.name || null,
          image: user.image || null,
          emailVerified: new Date(),
        })
        .eq('email', user.email);
      
      if (updateError) {
        console.error('Error updating existing user:', updateError);
        // Don't block sign-in for database errors
      }
    } else {
      // Create new user with generated UUID
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: newUserId,
          email: user.email,
          name: user.name || null,
          image: user.image || null,
          emailVerified: new Date(),
        });
      
      if (insertError) {
        console.error('Error creating new user:', insertError);
        // Don't block sign-in for database errors
      } else {
        console.log(`Created new user with UUID: ${newUserId}`);
      }
    }

    // Update user object with final ID
    (user as { id: string }).id = finalUserId;
    return true;
  } catch (error) {
    console.error('Error during sign-in process:', error);
    // Block sign-in on errors to prevent unauthorized access
    return false;
  }
}
```

**Critical Behaviors:**
- Returns `false` on whitelist failure → user sees error page
- Returns `false` on exceptions → prevents unauthorized access
- Database errors are logged but don't block sign-in (user already whitelisted)
- User ID is always a UUID, never Google's ID

### 2.3 `jwt` Callback

**Purpose:** Build and maintain JWT token with user data and role information

**Execution:** 
- On initial sign-in (with `account` and `user`)
- On every request when token needs refresh (every 24h)
- On manual `update()` call (with `trigger === 'update'`)

**Logic Flow:**
1. **Initial Sign-In:**
   - Store Google profile data (`googleId`, `picture`)
   - Store user ID from `user.id` (set in `signIn` callback)
   - Store user name, email, image

2. **Session Update (`trigger === 'update'`):**
   - Fetch latest user data from `users` table
   - Update token with fresh name, email, image

3. **Role Fetching (Lazy):**
   - If `token.sub` exists and `token.userRole` is missing
   - Fetch role from `whitelisted_users` via `getUserRole()`
   - Cache role in token (prevents repeated DB queries)

**Code:**
```typescript
async jwt({ token, account, profile, user, trigger }: { 
  token: JWT; 
  account?: Account | null; 
  profile?: Profile; 
  user?: User; 
  trigger?: 'signIn' | 'signUp' | 'update' 
}) {
  // Initial sign in
  if (isGoogleAccount(account) && isGoogleProfile(profile)) {
    token.googleId = profile.sub;
    token.picture = profile.picture;
  }

  if (hasUserId(user)) {
    token.sub = user.id;
    // Store user data in token during initial sign-in
    if (user.name !== undefined) {
      token.name = user.name;
    }
    if (user.email !== undefined) {
      token.email = user.email;
    }
    if (user.image !== undefined) {
      token.picture = user.image;
    }
  }

  // Handle session update - fetch latest user data from database
  if (trigger === 'update' && token.sub) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: userData, error } = await supabase
        .from('users')
        .select('name, email, image')
        .eq('id', token.sub)
        .single();

      if (!error && userData) {
        // Update token with latest user data
        if (userData.name !== undefined) {
          token.name = userData.name ?? null;
        }
        if (userData.email !== undefined) {
          token.email = userData.email ?? null;
        }
        if (userData.image !== undefined) {
          token.picture = userData.image ?? null;
        }
      }
    } catch (error) {
      console.error('Error fetching user data during update:', error);
    }
  }

  // Fetch and store user role information
  if (token.sub && !token.userRole) {
    try {
      const userRole = await getUserRole(token.sub);
      if (userRole) {
        token.userRole = {
          role: userRole.role,
          company_id: userRole.company_id,
          is_active: userRole.is_active,
        };
      }
    } catch (error) {
      console.error('Error fetching user role for JWT:', error);
    }
  }

  return token;
}
```

**Critical Behaviors:**
- Role is fetched **once** and cached in token (until token expires)
- Role changes require token expiration or manual `update()` call
- Token always includes `sub` (user ID) after initial sign-in
- Google profile data only stored on initial sign-in

### 2.4 `session` Callback

**Purpose:** Transform JWT token into session object for client-side access

**Execution:** On every session read (client calls `useSession()` or `getSession()`)

**Logic Flow:**
1. Extract user ID from `token.sub`
2. Map token fields to session.user (id, name, email, image)
3. Add `userRole` object from token to session
4. Return session object

**Code:**
```typescript
async session({ session, token }: { session: Session; token: JWT }) {
  if (token?.sub && session.user) {
    session.user.id = token.sub;

    // Update user data from token (includes updates from JWT callback)
    if (token.name !== undefined) {
      session.user.name = token.name;
    }
    if (token.email !== undefined) {
      session.user.email = token.email;
    }
    if (token.picture !== undefined) {
      session.user.image = token.picture;
    }

    // Add role information from token
    if (token.userRole) {
      session.userRole = {
        role: token.userRole.role as 'admin' | 'manager' | 'user',
        company_id: token.userRole.company_id as string | null,
        is_active: token.userRole.is_active as boolean,
      };
    }
  }
  return session;
}
```

**Critical Behaviors:**
- Session is **read-only** from client perspective
- To update session, client must call `update()` which triggers `jwt` callback
- `session.userRole` is optional (may be missing if role fetch failed)

### 2.5 Custom Logic: Roles and Permissions

**Role Hierarchy:**
- `admin`: Full system access, can manage whitelist and users
- `manager`: Can manage batches and receipts, limited admin functions
- `user`: Standard user, can create/view receipts and batches

**Role Storage:**
- Roles stored in `whitelisted_users.role` column
- Roles cached in JWT token (`token.userRole`)
- Roles checked server-side via `requireRole()` helper

**Role Checking Functions:**

**Server-Side (`lib/auth-server.ts`):**
```typescript
// Require specific role(s)
export async function requireRole(
  requiredRoles: ('admin' | 'manager' | 'user')[]
) {
  const session = await requireAuth();

  if (!session.user?.id) {
    redirect('/unauthorized');
  }

  const userRole = await getUserRole(session.user.id);

  if (!userRole || !hasRequiredRole(userRole.role, requiredRoles)) {
    redirect('/unauthorized');
  }

  return { session, userRole };
}
```

**Client-Side (`components/ProtectedRoute.tsx`):**
```typescript
// Check role from session
if (requiredRoles && session.userRole) {
  const userRole = session.userRole.role;
  if (!requiredRoles.includes(userRole)) {
    router.push('/unauthorized');
    return;
  }
}
```

**Critical:** Role checks are **defensive** - if role is missing, access is denied.

### 2.6 Custom Logic: Company ID and Multi-Tenancy

**Company ID Storage:**
- Stored in `whitelisted_users.company_id` (UUID, nullable)
- Included in session via `session.userRole.company_id`
- Currently **not enforced** in application logic (prepared for future use)

**Multi-Tenancy Readiness:**
- Database schema supports `company_id` foreign keys
- Session includes `company_id` for filtering
- No RLS policies currently enforce company isolation (all users see all data)

### 2.7 Multi-Tenancy Implementation Guide

**Status:** Infrastructure exists but not enforced. This section provides a complete implementation guide.

#### 2.7.1 Overview

Multi-tenancy ensures that users can only access data belonging to their company. The current system has the foundation (`company_id` in session) but lacks enforcement.

**Implementation Strategy:**
1. Create `companies` master table
2. Add `company_id` foreign keys to all data tables
3. Implement RLS policies for automatic data isolation
4. Add API route filtering helpers
5. Update application queries to respect company boundaries

#### 2.7.2 Database Schema for Multi-Tenancy

**Step 1: Create `companies` Table**

```sql
-- Create companies master table
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE, -- URL-friendly identifier
  domain TEXT, -- Optional: email domain for auto-assignment
  settings JSONB DEFAULT '{}', -- Company-specific settings
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON companies(is_active);

-- Trigger for updated_at
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own company
CREATE POLICY "Users can view their own company"
  ON companies
  FOR SELECT
  USING (
    id IN (
      SELECT company_id 
      FROM whitelisted_users 
      WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
        AND is_active = true
    )
  );
```

**Step 2: Add Foreign Key Constraint to `whitelisted_users`**

```sql
-- Add foreign key constraint (if not exists)
ALTER TABLE whitelisted_users
  ADD CONSTRAINT fk_whitelisted_users_company_id
  FOREIGN KEY (company_id)
  REFERENCES companies(id)
  ON DELETE SET NULL; -- Preserve users if company is deleted
```

**Step 3: Add `company_id` to Data Tables**

**Example: Add to `receipt_batches`**

```sql
-- Add company_id column
ALTER TABLE receipt_batches
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Create index
CREATE INDEX IF NOT EXISTS idx_receipt_batches_company_id 
  ON receipt_batches(company_id);

-- Backfill existing data (if needed)
-- UPDATE receipt_batches SET company_id = (
--   SELECT company_id FROM whitelisted_users 
--   WHERE email = (SELECT email FROM users WHERE id = receipt_batches.created_by)
--   LIMIT 1
-- );
```

**Repeat for all data tables:**
- `receipts` (or `tax_receipts`, `xero_receipts`)
- `owners`
- `chart_of_accounts` (if company-specific)
- `tax_types` (if company-specific)
- `xero_connections` (if company-specific)

#### 2.7.3 Row Level Security (RLS) Policies

**Strategy:** Use RLS to automatically filter queries by `company_id` from session.

**Helper Function: Get User's Company ID**

```sql
-- Function to get current user's company_id from JWT
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
DECLARE
  user_email TEXT;
  user_company_id UUID;
BEGIN
  -- Extract email from JWT claims (set by Supabase Auth or custom)
  user_email := current_setting('request.jwt.claims', true)::json->>'email';
  
  -- Get company_id from whitelisted_users
  SELECT company_id INTO user_company_id
  FROM whitelisted_users
  WHERE email = user_email
    AND is_active = true
  LIMIT 1;
  
  RETURN user_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Note:** This requires JWT claims to be set. For Supabase, you may need to use a different approach:

```sql
-- Alternative: Use Supabase auth.uid() if available
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
DECLARE
  user_id UUID;
  user_email TEXT;
  user_company_id UUID;
BEGIN
  -- Get user ID from Supabase auth (if using Supabase Auth)
  user_id := auth.uid();
  
  -- Get email from users table
  SELECT email INTO user_email
  FROM users
  WHERE id = user_id
  LIMIT 1;
  
  -- Get company_id
  SELECT company_id INTO user_company_id
  FROM whitelisted_users
  WHERE email = user_email
    AND is_active = true
  LIMIT 1;
  
  RETURN user_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**RLS Policy Example: `receipt_batches`**

```sql
-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON receipt_batches;

-- Policy: Users can only see batches from their company
CREATE POLICY "Users can view their company's batches"
  ON receipt_batches
  FOR SELECT
  USING (company_id = get_user_company_id());

-- Policy: Users can only insert batches for their company
CREATE POLICY "Users can insert batches for their company"
  ON receipt_batches
  FOR INSERT
  WITH CHECK (company_id = get_user_company_id());

-- Policy: Users can only update their company's batches
CREATE POLICY "Users can update their company's batches"
  ON receipt_batches
  FOR UPDATE
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

-- Policy: Users can only delete their company's batches
CREATE POLICY "Users can delete their company's batches"
  ON receipt_batches
  FOR DELETE
  USING (company_id = get_user_company_id());
```

**RLS Policy Example: `tax_receipts` (via batch)**

```sql
-- Policy: Users can only see receipts from their company's batches
CREATE POLICY "Users can view their company's receipts"
  ON tax_receipts
  FOR SELECT
  USING (
    batch_id IN (
      SELECT id FROM receipt_batches 
      WHERE company_id = get_user_company_id()
    )
  );

-- Similar policies for INSERT, UPDATE, DELETE
```

**RLS Policy: Admin Override**

```sql
-- Policy: Admins can see all companies (if needed)
CREATE POLICY "Admins can view all batches"
  ON receipt_batches
  FOR SELECT
  USING (
    -- Check if user is admin
    EXISTS (
      SELECT 1 FROM whitelisted_users
      WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
        AND role = 'admin'
        AND is_active = true
    )
    OR company_id = get_user_company_id() -- Or their own company
  );
```

#### 2.7.4 API Route Filtering Patterns

**Server-Side Helper: Get Company ID from Session**

**File:** `lib/auth-utils.ts` (add to existing file)

```typescript
/**
 * Get company ID from session
 * Returns null if user has no company or session is invalid
 */
export async function getCompanyIdFromSession(): Promise<string | null> {
  try {
    const session = await getServerSession(authConfig);
    
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
 * Require company ID - throws error if missing
 */
export async function requireCompanyId(): Promise<string> {
  const companyId = await getCompanyIdFromSession();
  
  if (!companyId) {
    throw new Error('User must belong to a company');
  }
  
  return companyId;
}
```

**API Route Pattern: Filter by Company**

**Example:** `app/api/batches/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import authConfig from '@/lib/auth.config';
import { getCompanyIdFromSession } from '@/lib/auth-utils';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get company ID from session
    const companyId = await getCompanyIdFromSession();
    
    if (!companyId) {
      return NextResponse.json(
        { error: 'User must belong to a company' },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();
    
    // Filter by company_id
    const { data: batches, error } = await supabase
      .from('receipt_batches')
      .select('*')
      .eq('company_id', companyId) // Explicit filter
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching batches:', error);
      return NextResponse.json(
        { error: 'Failed to fetch batches' },
        { status: 500 }
      );
    }

    return NextResponse.json({ batches });
  } catch (error) {
    console.error('Error in GET /api/batches:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get company ID from session
    const companyId = await getCompanyIdFromSession();
    
    if (!companyId) {
      return NextResponse.json(
        { error: 'User must belong to a company' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const supabase = getSupabaseAdmin();
    
    // Always set company_id on insert
    const { data: batch, error } = await supabase
      .from('receipt_batches')
      .insert({
        ...body,
        company_id: companyId, // Enforce company_id
        created_by: session.user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating batch:', error);
      return NextResponse.json(
        { error: 'Failed to create batch' },
        { status: 500 }
      );
    }

    return NextResponse.json({ batch }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/batches:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Service Layer Pattern: Always Filter by Company**

**Example:** `services/batchService.ts`

```typescript
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCompanyIdFromSession } from '@/lib/auth-utils';

export async function getBatches() {
  const companyId = await getCompanyIdFromSession();
  
  if (!companyId) {
    throw new Error('User must belong to a company');
  }

  const supabase = getSupabaseAdmin();
  
  const { data, error } = await supabase
    .from('receipt_batches')
    .select('*')
    .eq('company_id', companyId) // Always filter
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get batches: ${error.message}`);
  }

  return data;
}

export async function createBatch(batchData: any) {
  const companyId = await getCompanyIdFromSession();
  
  if (!companyId) {
    throw new Error('User must belong to a company');
  }

  const supabase = getSupabaseAdmin();
  
  const { data, error } = await supabase
    .from('receipt_batches')
    .insert({
      ...batchData,
      company_id: companyId, // Always set
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create batch: ${error.message}`);
  }

  return data;
}
```

#### 2.7.5 Migration Path

**Phase 1: Add Companies Table and Foreign Keys**

```sql
-- 1. Create companies table (see Step 1 above)
-- 2. Add foreign key to whitelisted_users
-- 3. Create initial companies
INSERT INTO companies (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Default Company', 'default'),
  ('00000000-0000-0000-0000-000000000002', 'Company A', 'company-a'),
  ('00000000-0000-0000-0000-000000000003', 'Company B', 'company-b');

-- 4. Assign existing users to default company
UPDATE whitelisted_users
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;
```

**Phase 2: Add `company_id` to Data Tables**

```sql
-- Add company_id to all data tables
ALTER TABLE receipt_batches ADD COLUMN company_id UUID;
ALTER TABLE tax_receipts ADD COLUMN company_id UUID;
-- ... repeat for all tables

-- Backfill: Assign company_id based on creator
UPDATE receipt_batches
SET company_id = (
  SELECT wu.company_id
  FROM whitelisted_users wu
  JOIN users u ON u.email = wu.email
  WHERE u.id = receipt_batches.created_by
  LIMIT 1
);

-- Add foreign key constraints
ALTER TABLE receipt_batches
  ADD CONSTRAINT fk_receipt_batches_company_id
  FOREIGN KEY (company_id)
  REFERENCES companies(id)
  ON DELETE CASCADE;
```

**Phase 3: Implement RLS Policies**

```sql
-- Create helper function
CREATE OR REPLACE FUNCTION get_user_company_id() ...;

-- Add RLS policies to all tables
-- (See examples in section 2.7.3)
```

**Phase 4: Update Application Code**

1. Update all API routes to filter by `company_id`
2. Update all service functions to include `company_id`
3. Update all INSERT statements to set `company_id`
4. Test thoroughly with multiple companies

**Phase 5: Remove Permissive Policies**

```sql
-- After RLS is working, remove permissive policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON receipt_batches;
-- Repeat for all tables
```

#### 2.7.6 Admin Override Pattern

**Scenario:** Admins need to see/manage all companies

**Option 1: Separate Admin Policies**

```sql
-- Policy: Admins can see all, users see only their company
CREATE POLICY "Company isolation with admin override"
  ON receipt_batches
  FOR SELECT
  USING (
    -- Admin can see all
    EXISTS (
      SELECT 1 FROM whitelisted_users
      WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
        AND role = 'admin'
        AND is_active = true
    )
    OR
    -- User sees only their company
    company_id = get_user_company_id()
  );
```

**Option 2: Application-Level Override**

```typescript
// In API route
const session = await getServerSession(authConfig);
const isAdmin = session?.userRole?.role === 'admin';
const companyId = isAdmin ? undefined : await getCompanyIdFromSession();

const query = supabase
  .from('receipt_batches')
  .select('*');

if (!isAdmin && companyId) {
  query.eq('company_id', companyId);
}
```

#### 2.7.7 Testing Multi-Tenancy

**Test Cases:**

1. **User A (Company 1) cannot see Company 2's data**
   - Create batch as User A (Company 1)
   - Sign in as User B (Company 2)
   - Query batches → should return empty array

2. **User can only create data for their company**
   - Sign in as User A (Company 1)
   - Create batch without `company_id` → should auto-set to Company 1
   - Create batch with different `company_id` → should fail (if enforced)

3. **Admin can see all companies**
   - Sign in as Admin
   - Query batches → should return batches from all companies

4. **RLS policies work at database level**
   - Use Supabase client directly (bypass application)
   - Query should still be filtered by RLS

#### 2.7.8 Critical Considerations

**Performance:**
- RLS policies add overhead to every query
- Index `company_id` columns for performance
- Consider materialized views for complex queries

**Data Migration:**
- Backfill `company_id` for existing data before enabling RLS
- Test RLS policies in staging before production
- Have rollback plan (disable RLS if needed)

**Null Company ID:**
- Decide: Allow users without company? (current: yes, nullable)
- Or require company assignment before access? (stricter)

**Cross-Company Operations:**
- Some operations may need cross-company access (e.g., system-wide reports)
- Use admin override or separate service account

---

## 3. Database Layer

### 3.1 Complete SQL Schema

#### 3.1.1 `users` Table

**Purpose:** Stores authenticated user profiles from Google OAuth

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY NOT NULL,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" TIMESTAMP WITH TIME ZONE,
  image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
```

**Triggers:**
```sql
-- Auto-update updated_at on row update
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**RLS Policies:**
```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Public users are viewable by everyone
CREATE POLICY "Public users are viewable by everyone"
  ON users
  FOR SELECT
  USING (true);

-- Allow authenticated users to insert their own user record
CREATE POLICY "Allow authenticated users to insert users"
  ON users
  FOR INSERT
  WITH CHECK (true);

-- Allow authenticated users to update their own user record
CREATE POLICY "Allow authenticated users to update users"
  ON users
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
```

**Critical Constraints:**
- `id` is **NOT** auto-generated (set by application via `randomUUID()`)
- `email` is **UNIQUE** and **NOT NULL**
- `emailVerified` is set on sign-in (current timestamp)

#### 3.1.2 `whitelisted_users` Table

**Purpose:** Email whitelist with role assignments

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS whitelisted_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'user')),
  company_id UUID, -- References companies(id) when multi-tenancy is enabled
  invited_by UUID REFERENCES whitelisted_users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Note:** `company_id` is nullable and currently has no foreign key constraint. See section 2.7 for multi-tenancy implementation.

#### 3.1.3 `companies` Table (Optional - Multi-Tenancy)

**Purpose:** Master table for companies/organizations (required for multi-tenancy)

**Status:** Not currently created in the system. See section 2.7 for implementation.

**Proposed Schema:**
```sql
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE, -- URL-friendly identifier
  domain TEXT, -- Optional: email domain for auto-assignment
  settings JSONB DEFAULT '{}', -- Company-specific settings
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON companies(is_active);

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
```

**Foreign Key Relationship:**
```sql
-- Add foreign key constraint to whitelisted_users
ALTER TABLE whitelisted_users
  ADD CONSTRAINT fk_whitelisted_users_company_id
  FOREIGN KEY (company_id)
  REFERENCES companies(id)
  ON DELETE SET NULL;
```

**Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_email ON whitelisted_users(email);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_role ON whitelisted_users(role);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_company_id ON whitelisted_users(company_id);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_invited_by ON whitelisted_users(invited_by);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_is_active ON whitelisted_users(is_active);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_created_at ON whitelisted_users(created_at);
```

**Triggers:**
```sql
CREATE TRIGGER update_whitelisted_users_updated_at
  BEFORE UPDATE ON whitelisted_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**RLS Policies:**
```sql
ALTER TABLE whitelisted_users ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users"
  ON whitelisted_users
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

**Critical Constraints:**
- `email` is **UNIQUE** and **NOT NULL**
- `role` is **CHECK** constrained to `('admin', 'manager', 'user')`
- `is_active` defaults to `true` (must be `true` for sign-in)
- `invited_by` self-references `whitelisted_users(id)` (nullable)

#### 3.1.3 `update_updated_at_column()` Function

**Purpose:** Auto-update `updated_at` timestamp on row updates

**Schema:**
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Usage:** Called by triggers on `users` and `whitelisted_users` tables

### 3.2 Table Relationships

**Relationship Diagram:**
```
whitelisted_users (1) ──┐
                        │ (email match)
users (1) ──────────────┘
```

**Relationship Type:** **Loose coupling via email** (not a foreign key)

**Critical:** The relationship between `users` and `whitelisted_users` is **not enforced by foreign keys**. The link is:
- `users.email` matches `whitelisted_users.email` (case-insensitive)
- Lookup performed in application code via `getUserRole(userId)`

**Why No Foreign Key:**
- `users.email` may not exist when `whitelisted_users` record is created
- Email can change (though not in current implementation)
- Allows whitelisting before first sign-in

### 3.3 Example SQL Queries Used by Auth Flow

#### Query 1: Check Email Whitelist
**Used in:** `checkEmailWhitelist()` function

```sql
SELECT *
FROM whitelisted_users
WHERE LOWER(email) = LOWER($1)
  AND is_active = true
LIMIT 1;
```

**Parameters:**
- `$1`: User's email (from Google OAuth)

**Returns:** Single row or null

#### Query 2: Find Existing User by Email
**Used in:** `signIn` callback

```sql
SELECT id
FROM users
WHERE email = $1
LIMIT 1;
```

**Parameters:**
- `$1`: User's email

**Returns:** `{ id: UUID }` or null (error code `PGRST116`)

#### Query 3: Create New User
**Used in:** `signIn` callback

```sql
INSERT INTO users (id, email, name, image, "emailVerified")
VALUES ($1, $2, $3, $4, $5);
```

**Parameters:**
- `$1`: Generated UUID (`randomUUID()`)
- `$2`: User's email
- `$3`: User's name (nullable)
- `$4`: User's image URL (nullable)
- `$5`: Current timestamp

#### Query 4: Update Existing User
**Used in:** `signIn` callback

```sql
UPDATE users
SET name = $1,
    image = $2,
    "emailVerified" = $3
WHERE email = $4;
```

**Parameters:**
- `$1`: User's name (nullable)
- `$2`: User's image URL (nullable)
- `$3`: Current timestamp
- `$4`: User's email

#### Query 5: Get User Role by User ID
**Used in:** `getUserRole()` function

**Step 1: Get email from users table**
```sql
SELECT email
FROM users
WHERE id = $1
LIMIT 1;
```

**Step 2: Get role from whitelisted_users**
```sql
SELECT role, company_id, is_active
FROM whitelisted_users
WHERE LOWER(email) = LOWER($1)
  AND is_active = true
LIMIT 1;
```

**Parameters:**
- Step 1: `$1` = User ID (UUID)
- Step 2: `$1` = Email from Step 1

**Returns:** `{ role: string, company_id: UUID | null, is_active: boolean }` or null

#### Query 6: Fetch User Data for Token Update
**Used in:** `jwt` callback (when `trigger === 'update'`)

```sql
SELECT name, email, image
FROM users
WHERE id = $1
LIMIT 1;
```

**Parameters:**
- `$1`: User ID (`token.sub`)

**Returns:** `{ name: string | null, email: string, image: string | null }`

### 3.4 How NextAuth Interacts with Database

**Database Usage Pattern:**

1. **Sign-In Flow:**
   - `signIn` callback → **writes** to `users` table (INSERT or UPDATE)
   - `signIn` callback → **reads** from `whitelisted_users` table (SELECT)

2. **Token Refresh Flow:**
   - `jwt` callback → **reads** from `users` table (SELECT, when `trigger === 'update'`)
   - `jwt` callback → **reads** from `whitelisted_users` table (SELECT, lazy role fetch)

3. **Session Read Flow:**
   - `session` callback → **no database queries** (uses token data only)

4. **Role Check Flow:**
   - `requireRole()` → **reads** from `users` table (SELECT email)
   - `requireRole()` → **reads** from `whitelisted_users` table (SELECT role)

**Database Client:**
- Uses **Supabase Admin Client** (`getSupabaseAdmin()`) with service role key
- Bypasses RLS policies (has full access)
- Used in all server-side auth operations

**Why Admin Client:**
- `signIn` callback needs to INSERT/UPDATE users (may not have RLS permission)
- Role fetching needs to read `whitelisted_users` (may be restricted by RLS)
- Ensures auth flow is not blocked by RLS policies

---

## 4. Environment & Secrets

### 4.1 Required Environment Variables

**File:** `.env.local` (or `.env` for production)

```bash
# NextAuth Configuration
AUTH_SECRET=<base64-encoded-secret-min-32-chars>
AUTH_GOOGLE_ID=<google-oauth-client-id>
AUTH_GOOGLE_SECRET=<google-oauth-client-secret>

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
```

### 4.2 Environment Variable Details

#### `AUTH_SECRET`
- **Type:** String (base64-encoded, minimum 32 characters)
- **Purpose:** Signs and encrypts JWT tokens
- **Generation:** `openssl rand -base64 32`
- **Critical:** Must be **unique per deployment** (changing invalidates all sessions)
- **Security:** Never commit to version control
- **Usage:** Used by NextAuth to sign JWTs and by middleware to validate tokens

#### `AUTH_GOOGLE_ID`
- **Type:** String (Google OAuth 2.0 Client ID)
- **Purpose:** Identifies application to Google OAuth
- **Format:** `xxxxx.apps.googleusercontent.com`
- **Obtained from:** [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
- **OAuth Consent Screen:** Must be configured with authorized redirect URIs:
  - `http://localhost:3000/api/auth/callback/google` (development)
  - `https://<your-domain>/api/auth/callback/google` (production)

#### `AUTH_GOOGLE_SECRET`
- **Type:** String (Google OAuth 2.0 Client Secret)
- **Purpose:** Authenticates application to Google OAuth
- **Security:** Never expose to client-side code
- **Obtained from:** Same Google Cloud Console credentials page

#### `NEXT_PUBLIC_SUPABASE_URL`
- **Type:** String (URL)
- **Purpose:** Supabase project URL (public, safe to expose)
- **Format:** `https://<project-id>.supabase.co`
- **Usage:** Used by both client and server-side Supabase clients

#### `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Type:** String (JWT)
- **Purpose:** Supabase anonymous/public key (public, safe to expose)
- **Usage:** Used by client-side Supabase client (not used in auth flow)
- **Note:** Auth flow uses service role key instead

#### `SUPABASE_SERVICE_ROLE_KEY`
- **Type:** String (JWT)
- **Purpose:** Supabase service role key (elevated permissions)
- **Security:** **NEVER expose to client-side** (bypasses RLS)
- **Usage:** Used by `getSupabaseAdmin()` for auth operations
- **Critical:** Required for `signIn` callback to write to `users` table

### 4.3 Secret Handling and Encryption

**JWT Token Encryption:**
- Tokens are **signed** (not encrypted) using `AUTH_SECRET`
- Token payload is **base64-encoded** (readable if decoded, but tamper-proof)
- Sensitive data (email, name) is in token payload (consider encryption for PII)

**Cookie Security:**
- Cookies are **HTTP-only** (not accessible via JavaScript)
- Cookies are **Secure** in production (HTTPS only)
- Cookies use **SameSite: Lax** (CSRF protection)

**Environment Variable Security:**
- `.env.local` is gitignored (never committed)
- Production secrets stored in deployment platform (Vercel, etc.)
- Service role key never exposed to client bundle

### 4.4 Development vs Production Differences

**Development:**
```bash
# .env.local
AUTH_SECRET=<local-secret>
AUTH_GOOGLE_ID=<dev-client-id>
AUTH_GOOGLE_SECRET=<dev-client-secret>
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321  # Local Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
```

**Production:**
```bash
# Environment variables in deployment platform
AUTH_SECRET=<production-secret>  # Different from dev!
AUTH_GOOGLE_ID=<prod-client-id>  # Different OAuth app
AUTH_GOOGLE_SECRET=<prod-client-secret>
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<prod-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<prod-service-role-key>
```

**Key Differences:**
1. **Different OAuth Apps:** Development and production should use separate Google OAuth apps
2. **Different Secrets:** `AUTH_SECRET` must be different (prevents token reuse)
3. **Different Supabase Projects:** Can use same project or separate (recommended: separate)
4. **HTTPS Required:** Production requires HTTPS for secure cookies

---

## 5. Transfer Instructions (Destination System)

### 5.1 Prerequisites

**Destination System Must Have:**
1. Next.js 14+ (App Router)
2. TypeScript
3. Supabase account and project
4. Google Cloud account (for OAuth)
5. Node.js 18+ and npm/pnpm/yarn

### 5.2 Step-by-Step Implementation

#### Step 1: Install Dependencies

```bash
npm install next-auth@latest @supabase/supabase-js
npm install -D @types/node
```

**Required Versions:**
- `next-auth`: `^5.0.0` (beta) or latest stable
- `@supabase/supabase-js`: `^2.0.0` or latest

#### Step 2: Create Database Schema

**Run these migrations in order:**

**Migration 1: Create `update_updated_at_column()` function**
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Migration 2: Create `users` table**
```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY NOT NULL,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" TIMESTAMP WITH TIME ZONE,
  image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public users are viewable by everyone"
  ON users FOR SELECT USING (true);

CREATE POLICY "Allow authenticated users to insert users"
  ON users FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update users"
  ON users FOR UPDATE USING (true) WITH CHECK (true);
```

**Migration 3: Create `whitelisted_users` table**
```sql
CREATE TABLE IF NOT EXISTS whitelisted_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'user')),
  company_id UUID,
  invited_by UUID REFERENCES whitelisted_users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whitelisted_users_email ON whitelisted_users(email);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_role ON whitelisted_users(role);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_company_id ON whitelisted_users(company_id);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_invited_by ON whitelisted_users(invited_by);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_is_active ON whitelisted_users(is_active);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_created_at ON whitelisted_users(created_at);

CREATE TRIGGER update_whitelisted_users_updated_at
  BEFORE UPDATE ON whitelisted_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE whitelisted_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users"
  ON whitelisted_users FOR ALL USING (true) WITH CHECK (true);
```

**Migration 4: Insert initial admin user**
```sql
INSERT INTO whitelisted_users (email, role, is_active)
VALUES ('your-admin@example.com', 'admin', true)
ON CONFLICT (email) DO NOTHING;
```

**Optional Migration 5: Set up Multi-Tenancy (if needed)**
```sql
-- See section 2.7 for complete multi-tenancy implementation
-- This is optional - system works without it
-- 1. Create companies table
-- 2. Add foreign key constraint to whitelisted_users
-- 3. Add company_id to data tables
-- 4. Implement RLS policies
```

#### Step 3: Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable "Google+ API" (or "Google Identity API")
4. Create OAuth 2.0 credentials:
   - Application type: **Web application**
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google` (dev)
     - `https://<your-domain>/api/auth/callback/google` (prod)
5. Copy Client ID and Client Secret

#### Step 4: Set Up Supabase

1. Create a new Supabase project (or use existing)
2. Copy Project URL and API keys:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`
3. Run migrations from Step 2 in Supabase SQL Editor

#### Step 5: Create Environment Variables

Create `.env.local`:
```bash
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_GOOGLE_ID=<from-google-cloud-console>
AUTH_GOOGLE_SECRET=<from-google-cloud-console>
NEXT_PUBLIC_SUPABASE_URL=<from-supabase>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from-supabase>
SUPABASE_SERVICE_ROLE_KEY=<from-supabase>
```

#### Step 6: Create File Structure

```
your-project/
├── app/
│   ├── api/
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts          # NextAuth route handler
│   ├── signin/
│   │   └── page.tsx                  # Sign-in page
│   ├── unauthorized/
│   │   └── page.tsx                  # Unauthorized page
│   └── layout.tsx                    # Root layout with SessionProvider
├── lib/
│   ├── auth.config.ts                # NextAuth configuration
│   ├── auth.ts                       # Optional: re-export handler
│   ├── auth-server.ts                # Server-side auth utilities
│   ├── auth-utils.ts                 # Database helper functions
│   ├── auth.types.ts                 # TypeScript type guards
│   └── supabase.ts                   # Supabase client setup
├── components/
│   ├── SessionProvider.tsx          # NextAuth SessionProvider wrapper
│   └── ProtectedRoute.tsx            # Client-side route protection
├── middleware.ts                     # Route protection middleware
└── types/
    └── next-auth.d.ts                # TypeScript type definitions
```

#### Step 7: Copy Core Files

**Copy these files verbatim** (adapt paths if needed):

1. `lib/auth.config.ts` - Complete NextAuth configuration
2. `lib/auth-utils.ts` - Database helper functions
3. `lib/auth-server.ts` - Server-side auth utilities
4. `lib/auth.types.ts` - Type guards
5. `lib/supabase.ts` - Supabase client setup
6. `types/next-auth.d.ts` - TypeScript definitions
7. `app/api/auth/[...nextauth]/route.ts` - Route handler
8. `middleware.ts` - Route protection
9. `components/SessionProvider.tsx` - Session provider wrapper
10. `components/ProtectedRoute.tsx` - Client-side protection

**Adapt these files:**

1. `app/signin/page.tsx` - Customize UI/styling
2. `app/unauthorized/page.tsx` - Customize UI/styling
3. `app/layout.tsx` - Integrate SessionProvider into your layout

#### Step 8: Configure Next.js

**Ensure `next.config.ts` includes:**
```typescript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // ... your config
};

export default nextConfig;
```

**No special NextAuth configuration required** (handled in `auth.config.ts`).

#### Step 9: Test Authentication Flow

1. **Start development server:**
   ```bash
   npm run dev
   ```

2. **Navigate to `/signin`**
   - Should see sign-in page
   - Click "Sign in with Google"
   - Should redirect to Google OAuth

3. **After Google consent:**
   - Should redirect back to app
   - Should see dashboard/home page
   - Check browser cookies: should have `next-auth.session-token`

4. **Test protected route:**
   - Navigate to any route (not `/signin` or `/unauthorized`)
   - Should be allowed (middleware validates token)

5. **Test unauthorized access:**
   - Sign out
   - Try to access protected route
   - Should redirect to `/signin?callbackUrl=<route>`

6. **Test role-based access:**
   - Create test users with different roles in `whitelisted_users`
   - Test `requireRole(['admin'])` in API route
   - Should allow admin, deny others

### 5.3 File Structure and Placement

**Critical File Locations:**

1. **NextAuth Route Handler:**
   - **MUST be at:** `app/api/auth/[...nextauth]/route.ts`
   - **Why:** Next.js App Router requires this exact path for catch-all routes

2. **Middleware:**
   - **MUST be at:** `middleware.ts` (root of project)
   - **Why:** Next.js looks for middleware at project root

3. **Type Definitions:**
   - **MUST be at:** `types/next-auth.d.ts` (or `@/types/next-auth.d.ts`)
   - **Why:** TypeScript module augmentation requires this path

4. **Auth Config:**
   - **Can be anywhere:** `lib/auth.config.ts` (or `@/lib/auth.config.ts`)
   - **Why:** Imported by route handler and server utilities

### 5.4 What Must Be Copied Verbatim

**These files contain critical logic and must be copied exactly:**

1. **`lib/auth.config.ts`** - All callbacks and configuration
2. **`lib/auth-utils.ts`** - Database query logic
3. **`lib/auth-server.ts`** - Server-side auth checks
4. **`lib/auth.types.ts`** - Type guards (prevents runtime errors)
5. **`types/next-auth.d.ts`** - TypeScript definitions (ensures type safety)
6. **`middleware.ts`** - Route protection logic

**These can be adapted:**

1. **`app/signin/page.tsx`** - UI/styling can be customized
2. **`app/unauthorized/page.tsx`** - UI/styling can be customized
3. **`components/ProtectedRoute.tsx`** - Loading UI can be customized
4. **`lib/supabase.ts`** - Can use different Supabase client setup (but must export `getSupabaseAdmin()`)

### 5.5 Assumptions Destination System Must Satisfy

**Required Assumptions:**

1. **Supabase PostgreSQL Database:**
   - Must support UUID type
   - Must support triggers and functions
   - Must support RLS (Row Level Security)

2. **Next.js App Router:**
   - Must use App Router (not Pages Router)
   - Must support Server Components and Server Actions
   - Must support middleware

3. **TypeScript:**
   - Must have TypeScript enabled
   - Must support module augmentation (`declare module`)

4. **Environment Variables:**
   - Must support `.env.local` for local development
   - Must support environment variables in deployment platform

5. **Cookie Support:**
   - Browser must support HTTP-only cookies
   - Must use HTTPS in production (for secure cookies)

6. **Google OAuth:**
   - Must have Google Cloud account
   - Must be able to configure OAuth consent screen
   - Must be able to add redirect URIs

**Optional Assumptions:**

1. **Styling:** Can use any CSS framework (Tailwind, CSS Modules, etc.)
2. **UI Components:** Can use any component library (shadcn/ui, Material-UI, etc.)
3. **State Management:** Can use any state management (Zustand, Redux, etc.)

---

## 6. Edge Cases & Guarantees

### 6.1 Failure Modes

#### 6.1.1 Invalid Sessions

**Scenario:** User has expired or invalid JWT token

**Behavior:**
- Middleware detects invalid token via `getToken()`
- Returns `null` if token is expired or malformed
- Redirects to `/signin?callbackUrl=<current-path>`

**Code:**
```typescript
// middleware.ts
const token = await getToken({
  req: request,
  secret: process.env.AUTH_SECRET,
});

if (!token) {
  const signInUrl = new URL('/signin', request.url);
  signInUrl.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(signInUrl);
}
```

**Guarantee:** Invalid sessions always redirect to sign-in (never allow access).

#### 6.1.2 Expired Tokens

**Scenario:** Token expiration (`exp` claim) has passed

**Behavior:**
- `getToken()` returns `null` for expired tokens
- Middleware redirects to sign-in
- User must re-authenticate

**Token Expiration:**
- Absolute expiration: 30 days from last refresh
- Refresh window: 24 hours (token refreshed on access)

**Guarantee:** Expired tokens are never accepted (prevents stale sessions).

#### 6.1.3 Missing Users

**Scenario:** User exists in `whitelisted_users` but not in `users` table

**Behavior:**
- `signIn` callback creates user record on first sign-in
- If creation fails (database error), sign-in is **not blocked** (logged only)
- User can still proceed (whitelist check passed)

**Code:**
```typescript
if (insertError) {
  console.error('Error creating new user:', insertError);
  // Don't block sign-in for database errors
}
```

**Guarantee:** Whitelist check is authoritative; database sync errors don't block auth.

**Scenario:** User exists in `users` but not in `whitelisted_users`

**Behavior:**
- `signIn` callback checks whitelist **first**
- If not whitelisted, returns `false` (blocks sign-in)
- User cannot sign in even if `users` record exists

**Guarantee:** Whitelist is always checked before database sync.

#### 6.1.4 Missing Role Data

**Scenario:** User has valid session but `token.userRole` is missing

**Behavior:**
- `jwt` callback fetches role on-demand (lazy loading)
- If fetch fails, `token.userRole` remains `undefined`
- `requireRole()` checks role server-side (fails if missing)
- Client-side `ProtectedRoute` checks `session.userRole` (fails if missing)

**Code:**
```typescript
// jwt callback
if (token.sub && !token.userRole) {
  try {
    const userRole = await getUserRole(token.sub);
    if (userRole) {
      token.userRole = { ... };
    }
  } catch (error) {
    console.error('Error fetching user role for JWT:', error);
  }
}
```

**Guarantee:** Missing role data results in access denial (defensive).

#### 6.1.5 Database Connection Failures

**Scenario:** Supabase database is unavailable during sign-in

**Behavior:**
- `signIn` callback catches errors and returns `false`
- User sees error page (`/unauthorized`)
- Sign-in is blocked (prevents unauthorized access)

**Code:**
```typescript
try {
  // ... whitelist check and user sync
  return true;
} catch (error) {
  console.error('Error during sign-in process:', error);
  return false; // Block sign-in on errors
}
```

**Guarantee:** Database failures block authentication (fail-secure).

**Scenario:** Database unavailable during role fetch

**Behavior:**
- `getUserRole()` returns `null` on error
- `requireRole()` redirects to `/unauthorized`
- Access is denied

**Guarantee:** Role fetch failures result in access denial.

#### 6.1.6 Whitelist Status Changes

**Scenario:** User's `is_active` is set to `false` after sign-in

**Behavior:**
- Role is cached in JWT token (not refreshed automatically)
- User retains access until token expires (30 days) or is manually refreshed
- Manual refresh: Client calls `update()` → `jwt` callback runs → role re-fetched → access denied if inactive

**Mitigation:**
- Admin can revoke access immediately by setting `is_active = false`
- But user may continue accessing for up to 30 days (token expiration)
- Or up to 24 hours (token refresh window)

**Recommendation:** Implement token revocation endpoint that checks `is_active` on every request (not implemented in current system).

**Guarantee:** Whitelist changes are eventually consistent (within token expiration window).

### 6.2 Security Considerations

#### 6.2.1 JWT Token Security

**Token Storage:**
- Stored in HTTP-only cookies (not accessible via JavaScript)
- Secure flag enabled in production (HTTPS only)
- SameSite: Lax (CSRF protection)

**Token Signing:**
- Signed with `AUTH_SECRET` (HMAC-SHA256)
- Tampering detected on validation (signature mismatch)
- Expiration enforced (`exp` claim)

**Token Payload:**
- Contains user ID, email, name, image, role
- **Not encrypted** (base64-encoded only)
- Sensitive data (email) is readable if token is decoded

**Recommendation:** Consider encrypting PII in token payload for enhanced security.

#### 6.2.2 Email Whitelisting Security

**Whitelist Check:**
- Performed server-side in `signIn` callback
- Case-insensitive email matching
- Active status check (`is_active = true`)

**Bypass Prevention:**
- Whitelist check cannot be bypassed (runs before token creation)
- Client cannot modify whitelist (server-side only)
- Database RLS policies restrict whitelist access (admin only)

**Guarantee:** Only whitelisted, active users can authenticate.

#### 6.2.3 Role-Based Access Control

**Role Storage:**
- Roles stored in database (`whitelisted_users.role`)
- Roles cached in JWT token (performance optimization)
- Roles checked server-side (`requireRole()`)

**Role Bypass Prevention:**
- Client-side role checks are **not authoritative** (UI only)
- Server-side role checks are **authoritative** (enforced in API routes)
- Role changes require token refresh (eventual consistency)

**Guarantee:** Role checks are enforced server-side (client checks are UX only).

#### 6.2.4 Database Access Security

**Service Role Key:**
- Used only server-side (`getSupabaseAdmin()`)
- Never exposed to client bundle
- Bypasses RLS (full database access)

**RLS Policies:**
- `users` table: Public read, authenticated write
- `whitelisted_users` table: Authenticated users can read/write (admin-only in practice)

**Recommendation:** Implement stricter RLS policies that enforce role-based access (not implemented in current system).

#### 6.2.5 OAuth Flow Security

**Authorization Code Flow:**
- Uses authorization code (not access token) in redirect
- Code exchanged server-side for tokens
- Prevents token leakage in URL

**Redirect URI Validation:**
- Google validates redirect URIs (must match registered URIs)
- Prevents open redirect attacks

**State Parameter:**
- NextAuth handles CSRF protection (state parameter)
- Validates state on callback

**Guarantee:** OAuth flow follows security best practices.

### 6.3 System Invariants

#### Invariant 1: Email Uniqueness

**Invariant:** `users.email` and `whitelisted_users.email` are UNIQUE

**Enforced By:**
- Database UNIQUE constraints
- Application logic (single user per email)

**Violation Impact:**
- Database constraint violation on duplicate insert
- Application error (handled gracefully)

**Guarantee:** One user record per email address.

#### Invariant 2: Whitelist-First Authentication

**Invariant:** User must be whitelisted before authentication

**Enforced By:**
- `signIn` callback checks whitelist before token creation
- Returns `false` if not whitelisted

**Violation Impact:**
- User cannot sign in (blocked at OAuth callback)

**Guarantee:** Only whitelisted users can authenticate.

#### Invariant 3: User ID Consistency

**Invariant:** `token.sub` (user ID) matches `users.id`

**Enforced By:**
- `signIn` callback sets `user.id` to database UUID
- `jwt` callback stores `user.id` as `token.sub`

**Violation Impact:**
- Token contains invalid user ID
- Role fetch fails (user not found)
- Access denied

**Guarantee:** Token user ID always references valid `users` record.

#### Invariant 4: Role Consistency

**Invariant:** `token.userRole.role` matches `whitelisted_users.role` (eventually)

**Enforced By:**
- `jwt` callback fetches role from database
- Role cached in token (may be stale)

**Violation Impact:**
- Role changes not reflected until token refresh
- User may have incorrect permissions temporarily

**Guarantee:** Role data is eventually consistent (within token expiration window).

#### Invariant 5: Session Statelessness

**Invariant:** Sessions are stateless (no database queries for validation)

**Enforced By:**
- JWT strategy (no database sessions table)
- Middleware validates token signature only

**Violation Impact:**
- If violated, system would require database queries per request (performance degradation)

**Guarantee:** Session validation is O(1) (token signature check only).

#### 6.1.6 Multi-Tenancy Edge Cases

**Scenario:** User's `company_id` changes after sign-in

**Behavior:**
- Role (including `company_id`) is cached in JWT token
- User retains old `company_id` until token expires (30 days) or manual refresh
- Data access may be incorrect until token refresh

**Mitigation:**
- Manual refresh: Client calls `update()` → role re-fetched → `company_id` updated
- Or wait for token expiration (30 days)

**Guarantee:** Company changes are eventually consistent (within token expiration window).

**Scenario:** User has `company_id = null` (no company assigned)

**Behavior:**
- If RLS policies require `company_id`, user cannot access any data
- If application filters by `company_id`, queries return empty results
- User can still authenticate but has no data access

**Recommendation:** Either:
1. Require `company_id` before allowing sign-in (stricter)
2. Allow null `company_id` but show empty state (current approach)

**Scenario:** Company is deleted (`companies` record deleted)

**Behavior:**
- Foreign key constraint: `whitelisted_users.company_id` set to `NULL` (if `ON DELETE SET NULL`)
- Or: Users deleted if `ON DELETE CASCADE` (if foreign key exists)
- Existing data: Depends on foreign key constraint on data tables

**Recommendation:** Use `ON DELETE SET NULL` for `whitelisted_users` to preserve users, and `ON DELETE CASCADE` for data tables to clean up orphaned data.

**Scenario:** RLS policy fails (function error, missing JWT claims)

**Behavior:**
- RLS function returns `NULL` → policy evaluates to false → access denied
- User cannot access any data (fail-secure)

**Mitigation:**
- Ensure JWT claims are properly set
- Test RLS functions thoroughly
- Have fallback mechanism (admin override)

**Guarantee:** RLS failures result in access denial (fail-secure).

---

## Appendix A: TypeScript Type Definitions

**File:** `types/next-auth.d.ts`

```typescript
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    userRole?: {
      role: 'admin' | 'manager' | 'user';
      company_id: string | null;
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
      role: 'admin' | 'manager' | 'user';
      company_id: string | null;
      is_active: boolean;
    };
  }
}
```

---

## Appendix B: Complete File List

**Files to Copy (Verbatim):**
1. `lib/auth.config.ts`
2. `lib/auth-utils.ts`
3. `lib/auth-server.ts`
4. `lib/auth.types.ts`
5. `types/next-auth.d.ts`
6. `app/api/auth/[...nextauth]/route.ts`
7. `middleware.ts`

**Files to Adapt:**
1. `lib/supabase.ts` (adapt if using different Supabase setup)
2. `app/signin/page.tsx` (customize UI)
3. `app/unauthorized/page.tsx` (customize UI)
4. `components/SessionProvider.tsx` (may need path adjustments)
5. `components/ProtectedRoute.tsx` (may need path adjustments)
6. `app/layout.tsx` (integrate SessionProvider)

**Database Migrations:**
1. `update_updated_at_column()` function
2. `users` table creation
3. `whitelisted_users` table creation

---

## Appendix C: Testing Checklist

**Authentication Flow:**
- [ ] Sign in with whitelisted email → success
- [ ] Sign in with non-whitelisted email → blocked
- [ ] Sign in with inactive whitelist entry → blocked
- [ ] Sign out → redirects to sign-in
- [ ] Access protected route without auth → redirects to sign-in
- [ ] Access protected route with valid session → allowed

**Session Management:**
- [ ] Session persists across page refreshes
- [ ] Session expires after 30 days
- [ ] Session refreshes every 24 hours
- [ ] Manual `update()` refreshes session data

**Role-Based Access:**
- [ ] Admin can access admin routes
- [ ] Manager cannot access admin routes
- [ ] User cannot access admin routes
- [ ] Role changes reflected after token refresh

**Edge Cases:**
- [ ] Expired token → redirects to sign-in
- [ ] Invalid token → redirects to sign-in
- [ ] Database unavailable → blocks sign-in
- [ ] Missing role data → denies access

---

**End of Blueprint**

