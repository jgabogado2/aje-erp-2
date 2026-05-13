import { z } from 'zod';
import { FREQUENCIES } from '@/lib/tracker.types';

// task_lists is "task item" in the UI — it's the entry-generating row.
// All the properties that used to live on `tasks` (frequency, assignee,
// skip rules) now live here.

export const taskListCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  tracker_section_id: z.string().uuid().nullable().optional(),
  display_order: z.number().int().min(0).max(9999).optional(),
  frequency: z.enum(FREQUENCIES),
  assigned_to: z.string().uuid().nullable().optional(),
  skip_weekends: z.boolean().optional(),
  skip_holidays: z.boolean().optional(),
});

export const taskListUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  tracker_section_id: z.string().uuid().nullable().optional(),
  display_order: z.number().int().min(0).max(9999).optional(),
  frequency: z.enum(FREQUENCIES).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  skip_weekends: z.boolean().optional(),
  skip_holidays: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const taskListReorderSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1),
});

export type TaskListCreateInput = z.infer<typeof taskListCreateSchema>;
export type TaskListUpdateInput = z.infer<typeof taskListUpdateSchema>;
export type TaskListReorderInput = z.infer<typeof taskListReorderSchema>;
