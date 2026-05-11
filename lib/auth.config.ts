import GoogleProvider from 'next-auth/providers/google';
import { getSupabaseAdmin } from '@/lib/supabase';
import { checkEmailWhitelist, linkUserToWhitelist, getUserRole } from '@/lib/auth-utils';
import { randomUUID } from 'crypto';
import { isGoogleAccount, isGoogleProfile, hasUserId } from '@/lib/auth.types';
import type { User, Account, Session, Profile } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import type { NextAuthOptions } from 'next-auth';

export const authConfig: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: '/signin',
    signOut: '/signin',
    error: '/unauthorized',
  },
  callbacks: {
    /**
     * Sign-in callback: Gate authentication by email whitelist and sync user to database
     * Runs once per sign-in attempt, BEFORE token creation
     */
    async signIn({
      user,
      account,
    }: {
      user: User;
      account: Account | null;
    }): Promise<boolean> {
      // Only process Google OAuth sign-ins
      if (!isGoogleAccount(account) || !user.email) {
        console.log('Sign-in blocked: Not Google provider or missing email');
        return false;
      }

      try {
        console.log(`Attempting sign-in for: ${user.email}`);

        // Step 1: Check if email is whitelisted
        const whitelistEntry = await checkEmailWhitelist(user.email);

        if (!whitelistEntry) {
          console.log(`Access denied: ${user.email} is not whitelisted in any organization`);
          return false;
        }

        console.log(
          `Whitelisted user signing in: ${user.email} (${whitelistEntry.role})`
        );

        const supabase = getSupabaseAdmin();

        // Step 2: Sync user to Supabase users table
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
              emailVerified: new Date().toISOString(),
            })
            .eq('email', user.email);

          if (updateError) {
            console.error('Error updating existing user:', updateError);
            // Don't block sign-in for database errors
          }
        } else {
          // Create new user with generated UUID
          const { error: insertError } = await supabase.from('users').insert({
            id: newUserId,
            email: user.email,
            name: user.name || null,
            image: user.image || null,
            emailVerified: new Date().toISOString(),
          });

          if (insertError) {
            console.error('Error creating new user:', insertError);
            // Don't block sign-in for database errors
          } else {
            console.log(`Created new user with UUID: ${newUserId}`);
          }
        }

        // Step 3: Link user to their whitelist entry (if not already linked)
        if (!whitelistEntry.user_id) {
          const linked = await linkUserToWhitelist(finalUserId, user.email);
          if (linked) {
            console.log(`Linked user ${finalUserId} to whitelist entry for ${user.email}`);
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
    },

    /**
     * JWT callback: Build and maintain JWT token with user data and role information
     * Runs on initial sign-in, token refresh, and manual update() calls
     */
    async jwt({
      token,
      account,
      profile,
      user,
      trigger,
    }: {
      token: JWT;
      account?: Account | null;
      profile?: Profile;
      user?: User;
      trigger?: 'signIn' | 'signUp' | 'update';
    }): Promise<JWT> {
      // Initial sign in - store Google profile data
      if (isGoogleAccount(account) && isGoogleProfile(profile)) {
        token.googleId = profile.sub;
        token.picture = profile.picture;
      }

      // Store user ID and data from signIn callback
      if (hasUserId(user)) {
        token.sub = user.id;
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

          // Also refresh role on update
          const userRole = await getUserRole(token.sub);
          if (userRole) {
            token.userRole = {
              role: userRole.role,
              organization_id: userRole.organization_id,
              is_active: userRole.is_active,
            };
          }
        } catch (error) {
          console.error('Error fetching user data during update:', error);
        }
      }

      // Fetch and store user role information (lazy loading)
      if (token.sub && !token.userRole) {
        try {
          const userRole = await getUserRole(token.sub);
          if (userRole) {
            token.userRole = {
              role: userRole.role,
              organization_id: userRole.organization_id,
              is_active: userRole.is_active,
            };
          }
        } catch (error) {
          console.error('Error fetching user role for JWT:', error);
        }
      }

      return token;
    },

    /**
     * Session callback: Transform JWT token into session object for client-side access
     * Runs on every session read (useSession(), getSession())
     */
    async session({
      session,
      token,
    }: {
      session: Session;
      token: JWT;
    }): Promise<Session> {
      if (token?.sub && session.user) {
        session.user.id = token.sub;

        // Update user data from token
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
            role: token.userRole.role as 'admin' | 'manager' | 'accountant',
            organization_id: token.userRole.organization_id as string | null,
            is_active: token.userRole.is_active as boolean,
          };
        }
      }
      return session;
    },
  },
};

export default authConfig;

