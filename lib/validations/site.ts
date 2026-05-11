import { z } from 'zod';

export const siteCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(32, 'Code must be at most 32 characters')
    .regex(/^[A-Z0-9-]+$/, 'Code must use uppercase letters, digits, and dashes only'),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(500).optional().nullable(),
});

export const siteUpdateSchema = z.object({
  code: siteCreateSchema.shape.code.optional(),
  name: siteCreateSchema.shape.name.optional(),
  address: z.string().trim().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
});

export type SiteCreateInput = z.infer<typeof siteCreateSchema>;
export type SiteUpdateInput = z.infer<typeof siteUpdateSchema>;
