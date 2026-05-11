import { z } from 'zod';
import { TASK_STATUSES } from '@/lib/tracker.types';

export const trackerEntriesQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  assignee: z.string().uuid().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  task_list_id: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
});

export type TrackerEntriesQuery = z.infer<typeof trackerEntriesQuerySchema>;
