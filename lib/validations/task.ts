import { z } from 'zod';

// tasks is "subtask" in the UI — a lightweight optional row under a
// task_list. No frequency, assignee, or skip rules: those are inherited
// from the parent task_list. Subtasks have no entries of their own; they
// appear as inline checklists inside each parent entry, tracked via
// task_entries.subtask_completions JSONB.

export const taskCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  display_order: z.number().int().min(0).max(9999).optional(),
});

export const taskUpdateSchema = z.object({
  task_list_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  display_order: z.number().int().min(0).max(9999).optional(),
});

export const taskReorderSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1),
});

// Toggle/set completion for a subtask within a specific task_entry. Sent
// as { subtask_id, done }. The server stores task_entries.subtask_completions
// as the union of completed subtask ids.
export const subtaskCompletionSchema = z.object({
  subtask_id: z.string().uuid(),
  done: z.boolean(),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type TaskReorderInput = z.infer<typeof taskReorderSchema>;
export type SubtaskCompletionInput = z.infer<typeof subtaskCompletionSchema>;
