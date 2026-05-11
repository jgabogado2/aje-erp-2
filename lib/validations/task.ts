import { z } from 'zod';
import { FREQUENCIES } from '@/lib/tracker.types';

export const taskCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  assigned_to: z.string().uuid().nullable().optional(),
  frequency: z.enum(FREQUENCIES),
  skip_weekends: z.boolean().optional(),
  skip_holidays: z.boolean().optional(),
  display_order: z.number().int().min(0).max(9999).optional(),
});

export const taskUpdateSchema = z.object({
  task_list_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  frequency: z.enum(FREQUENCIES).optional(),
  skip_weekends: z.boolean().optional(),
  skip_holidays: z.boolean().optional(),
  is_active: z.boolean().optional(),
  display_order: z.number().int().min(0).max(9999).optional(),
});

export const taskReorderSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type TaskReorderInput = z.infer<typeof taskReorderSchema>;
