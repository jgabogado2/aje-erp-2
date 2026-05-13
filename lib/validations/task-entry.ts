import { z } from 'zod';
import { BIR_STATUSES, TASK_STATUSES } from '@/lib/tracker.types';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const taskEntryUpdateSchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  submission_date: dateOnly.nullable().optional(),
  value: z.string().trim().max(500).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  bir_status: z.enum(BIR_STATUSES).nullable().optional(),
  subtask_completions: z.array(z.string().uuid()).optional(),
});

export type TaskEntryUpdateInput = z.infer<typeof taskEntryUpdateSchema>;
