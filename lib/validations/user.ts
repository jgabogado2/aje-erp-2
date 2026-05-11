import { z } from 'zod';
import { SYSTEM_ROLES, SITE_ROLES } from '@/lib/auth.types';

// Inviting a user = creating an organization_members row with their email.
// Actual `users` row is created on their first Google sign-in.
export const userInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Must be a valid email address'),
  role: z.enum(SYSTEM_ROLES),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const userUpdateSchema = z.object({
  role: z.enum(SYSTEM_ROLES).optional(),
  is_active: z.boolean().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const userSiteAssignSchema = z.object({
  user_id: z.string().uuid('user_id must be a UUID'),
  role: z.enum(SITE_ROLES),
});

export type UserInviteInput = z.infer<typeof userInviteSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type UserSiteAssignInput = z.infer<typeof userSiteAssignSchema>;
