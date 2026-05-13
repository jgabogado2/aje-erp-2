import { z } from 'zod';

export const AUDIT_ENTITY_TYPES = [
  'task_entry',
  'site',
  'user',
  'tracker_category',
  'site_tracker',
  'tracker_section',
  'task_list',
  'task',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'status_change'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditLogQuerySchema = z.object({
  site_id: z.string().uuid().optional(),
  entity_type: z.enum(AUDIT_ENTITY_TYPES).optional(),
  entity_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  // ISO date (yyyy-mm-dd) or full ISO timestamp.
  from: z.string().optional(),
  to: z.string().optional(),
  // Opaque cursor: `${created_at}|${id}` from the previous page's last row.
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
