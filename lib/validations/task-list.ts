import { z } from 'zod';

export const taskListCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  tracker_section_id: z.string().uuid().nullable().optional(),
  display_order: z.number().int().min(0).max(9999).optional(),
});

export const taskListUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  tracker_section_id: z.string().uuid().nullable().optional(),
  display_order: z.number().int().min(0).max(9999).optional(),
});

export const taskListReorderSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1),
});

export type TaskListCreateInput = z.infer<typeof taskListCreateSchema>;
export type TaskListUpdateInput = z.infer<typeof taskListUpdateSchema>;
export type TaskListReorderInput = z.infer<typeof taskListReorderSchema>;
