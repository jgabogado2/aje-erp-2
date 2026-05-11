'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth-server';

/**
 * Organization member data type for the admin management interface (whitelist entry)
 */
export interface OrganizationMemberData {
  id: string;
  user_id: string | null; // Nullable until user signs in
  email: string; // Whitelisted email
  organization_id: string;
  role: 'admin' | 'manager' | 'accountant';
  invited_by: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Combined member data with user profile information
 */
export interface MemberWithProfile extends OrganizationMemberData {
  user?: {
    id: string;
    name: string | null;
    image: string | null;
    emailVerified: string | null;
  } | null;
}

/**
 * Response type for actions
 */
export interface ActionResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get all organization members with their user profile data
 * Admin-only action
 */
export async function getUsers(): Promise<ActionResponse<MemberWithProfile[]>> {
  try {
    // Server-side permission check
    const { session } = await requireAdmin();

    const supabase = getSupabaseAdmin();

    // Get current user's organization
    const { data: currentMembership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (!currentMembership) {
      return { success: false, error: 'User not member of any organization' };
    }

    // Get all organization members with user data (left join since user_id can be null)
    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select(`
        *,
        user:users(
          id,
          name,
          image,
          emailVerified
        )
      `)
      .eq('organization_id', currentMembership.organization_id)
      .order('created_at', { ascending: false });

    if (membersError) {
      console.error('Error fetching organization members:', membersError);
      return { success: false, error: 'Failed to fetch members' };
    }

    // Map the data to ensure proper typing
    const membersWithProfile: MemberWithProfile[] = (members || []).map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      email: m.email,
      organization_id: m.organization_id,
      role: m.role,
      invited_by: m.invited_by,
      is_active: m.is_active,
      notes: m.notes,
      created_at: m.created_at,
      updated_at: m.updated_at,
      user: m.user,
    }));

    return { success: true, data: membersWithProfile };
  } catch (error) {
    console.error('Error in getUsers:', error);
    return { success: false, error: 'Unauthorized or server error' };
  }
}

/**
 * Create a new organization member
 * Admin-only action
 */
export async function createUser(data: {
  email: string;
  role: 'admin' | 'manager' | 'accountant';
  notes?: string | null;
}): Promise<ActionResponse<MemberWithProfile>> {
  try {
    // Server-side permission check
    const { session } = await requireAdmin();

    if (!data.email || !data.role) {
      return { success: false, error: 'Email and role are required' };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return { success: false, error: 'Invalid email format' };
    }

    // Validate role
    if (!['admin', 'manager', 'accountant'].includes(data.role)) {
      return { success: false, error: 'Invalid role' };
    }

    const supabase = getSupabaseAdmin();

    // Get current user's organization and membership ID
    const { data: currentMembership } = await supabase
      .from('organization_members')
      .select('id, organization_id')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (!currentMembership) {
      return { success: false, error: 'User not member of any organization' };
    }

    // Check if email is already whitelisted in this organization
    const { data: existingMember } = await supabase
      .from('organization_members')
      .select('id')
      .ilike('email', data.email)
      .eq('organization_id', currentMembership.organization_id)
      .single();

    if (existingMember) {
      return { success: false, error: 'This email is already whitelisted in your organization' };
    }

    // Create the organization membership (whitelist entry)
    // user_id will be null until they sign in for the first time
    const { data: newMember, error: createError } = await supabase
      .from('organization_members')
      .insert({
        user_id: null, // Will be set when they sign in
        email: data.email.toLowerCase().trim(),
        organization_id: currentMembership.organization_id,
        role: data.role,
        notes: data.notes || null,
        invited_by: currentMembership.id,
        is_active: true,
      })
      .select(`
        *,
        user:users(
          id,
          name,
          image,
          emailVerified
        )
      `)
      .single();

    if (createError) {
      console.error('Error creating organization member:', createError);
      return { success: false, error: 'Failed to create member' };
    }

    revalidatePath('/admin/users');
    return { success: true, data: newMember as MemberWithProfile };
  } catch (error) {
    console.error('Error in createUser:', error);
    return { success: false, error: 'Unauthorized or server error' };
  }
}

/**
 * Update an existing organization member
 * Admin-only action
 */
export async function updateUser(
  memberId: string,
  data: {
    role?: 'admin' | 'manager' | 'accountant';
    is_active?: boolean;
    notes?: string | null;
  }
): Promise<ActionResponse<MemberWithProfile>> {
  try {
    // Server-side permission check
    await requireAdmin();

    if (!memberId) {
      return { success: false, error: 'Member ID is required' };
    }

    // Validate role if provided
    if (data.role && !['admin', 'manager', 'accountant'].includes(data.role)) {
      return { success: false, error: 'Invalid role' };
    }

    const supabase = getSupabaseAdmin();

    // Check if the member exists
    const { data: existingMember, error: checkError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('id', memberId)
      .single();

    if (checkError || !existingMember) {
      return { success: false, error: 'Member not found' };
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (data.role !== undefined) updateData.role = data.role;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.notes !== undefined) updateData.notes = data.notes;

    // Update the member
    const { data: updatedMember, error: updateError } = await supabase
      .from('organization_members')
      .update(updateData)
      .eq('id', memberId)
      .select(`
        *,
        user:users(
          id,
          name,
          image,
          emailVerified
        )
      `)
      .single();

    if (updateError) {
      console.error('Error updating member:', updateError);
      return { success: false, error: 'Failed to update member' };
    }

    revalidatePath('/admin/users');
    return { success: true, data: updatedMember as MemberWithProfile };
  } catch (error) {
    console.error('Error in updateUser:', error);
    return { success: false, error: 'Unauthorized or server error' };
  }
}

/**
 * Delete an organization member
 * Admin-only action
 */
export async function deleteUser(memberId: string): Promise<ActionResponse> {
  try {
    // Server-side permission check
    const { session } = await requireAdmin();

    if (!memberId) {
      return { success: false, error: 'Member ID is required' };
    }

    const supabase = getSupabaseAdmin();

    // Check if the member exists
    const { data: existingMember, error: checkError } = await supabase
      .from('organization_members')
      .select('id, user_id, email')
      .eq('id', memberId)
      .single();

    if (checkError || !existingMember) {
      return { success: false, error: 'Member not found' };
    }

    // Prevent self-deletion (check by user_id if linked, or by email)
    const isSelf = existingMember.user_id === session.user.id ||
                   existingMember.email?.toLowerCase() === session.user.email?.toLowerCase();
    
    if (isSelf) {
      return { success: false, error: 'You cannot delete your own membership' };
    }

    // Delete the member
    const { error: deleteError } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', memberId);

    if (deleteError) {
      console.error('Error deleting member:', deleteError);
      return { success: false, error: 'Failed to delete member' };
    }

    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    console.error('Error in deleteUser:', error);
    return { success: false, error: 'Unauthorized or server error' };
  }
}

/**
 * Toggle member active status
 * Admin-only action
 */
export async function toggleUserStatus(memberId: string): Promise<ActionResponse<MemberWithProfile>> {
  try {
    // Server-side permission check
    const { session } = await requireAdmin();

    if (!memberId) {
      return { success: false, error: 'Member ID is required' };
    }

    const supabase = getSupabaseAdmin();

    // Get current member status
    const { data: existingMember, error: checkError } = await supabase
      .from('organization_members')
      .select('id, user_id, email, is_active')
      .eq('id', memberId)
      .single();

    if (checkError || !existingMember) {
      return { success: false, error: 'Member not found' };
    }

    // Prevent self-deactivation (check by user_id if linked, or by email)
    const isSelf = existingMember.user_id === session.user.id ||
                   existingMember.email?.toLowerCase() === session.user.email?.toLowerCase();
    
    if (isSelf) {
      return { success: false, error: 'You cannot deactivate your own membership' };
    }

    // Toggle status
    const { data: updatedMember, error: updateError } = await supabase
      .from('organization_members')
      .update({ is_active: !existingMember.is_active })
      .eq('id', memberId)
      .select(`
        *,
        user:users(
          id,
          name,
          image,
          emailVerified
        )
      `)
      .single();

    if (updateError) {
      console.error('Error toggling member status:', updateError);
      return { success: false, error: 'Failed to update member status' };
    }

    revalidatePath('/admin/users');
    return { success: true, data: updatedMember as MemberWithProfile };
  } catch (error) {
    console.error('Error in toggleUserStatus:', error);
    return { success: false, error: 'Unauthorized or server error' };
  }
}

