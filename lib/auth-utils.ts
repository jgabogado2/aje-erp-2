import { getSupabaseAdmin } from '@/lib/supabase';
import type { SystemRole } from '@/lib/auth.types';

export interface OrganizationMember {
  id: string;
  user_id: string | null;
  email: string;
  organization_id: string;
  role: SystemRole;
  invited_by: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  role: SystemRole;
  organization_id: string | null;
  is_active: boolean;
}

/**
 * Check if an email is whitelisted in any organization
 * Returns the whitelist entry if found and active, null otherwise
 */
export async function checkEmailWhitelist(
  email: string
): Promise<OrganizationMember | null> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('organization_members')
      .select('*')
      .ilike('email', email) // Case-insensitive match
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - email not whitelisted
        return null;
      }
      console.error('Error checking email whitelist:', error);
      return null;
    }

    return data as OrganizationMember;
  } catch (error) {
    console.error('Error checking email whitelist:', error);
    return null;
  }
}

/**
 * Link a user to their whitelist entry after first sign-in
 */
export async function linkUserToWhitelist(
  userId: string,
  email: string
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('organization_members')
      .update({ user_id: userId })
      .ilike('email', email)
      .is('user_id', null)
      .eq('is_active', true);

    if (error) {
      console.error('Error linking user to whitelist:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error linking user to whitelist:', error);
    return false;
  }
}

/**
 * Get user role information by user ID
 * Fetches role from organization_members table
 */
export async function getUserRole(userId: string): Promise<UserRole | null> {
  try {
    const supabase = getSupabaseAdmin();

    // Get role from organization_members
    const { data: memberData, error: memberError } = await supabase
      .from('organization_members')
      .select('role, organization_id, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (memberError) {
      if (memberError.code === 'PGRST116') {
        // No rows returned - user not a member of any organization
        return null;
      }
      console.error('Error fetching user role:', memberError);
      return null;
    }

    return {
      role: memberData.role as SystemRole,
      organization_id: memberData.organization_id,
      is_active: memberData.is_active,
    };
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

/**
 * Get user data by user ID
 */
export async function getUserById(userId: string) {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, image')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user by ID:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching user by ID:', error);
    return null;
  }
}

/**
 * Get user data by email
 */
export async function getUserByEmail(email: string) {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, image')
      .ilike('email', email) // Case-insensitive match
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - user not found
        return null;
      }
      console.error('Error fetching user by email:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching user by email:', error);
    return null;
  }
}

