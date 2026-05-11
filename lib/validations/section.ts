import { z } from 'zod';

export const sectionCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  display_order: z.number().int().min(0).max(9999).optional(),
});

export const sectionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  display_order: z.number().int().min(0).max(9999).optional(),
});

// Reorder takes an ordered list of section ids — the API rewrites display_order
// to match the array position.
export const sectionReorderSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1),
});

export type SectionCreateInput = z.infer<typeof sectionCreateSchema>;
export type SectionUpdateInput = z.infer<typeof sectionUpdateSchema>;
export type SectionReorderInput = z.infer<typeof sectionReorderSchema>;
