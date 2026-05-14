import { z } from 'zod';

export const NOTIFICATION_KINDS = [
  'overdue',
  'upcoming',
  'assigned',
  'status_changed',
] as const;

export const notificationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  unread_only: z.coerce.boolean().optional(),
});

export const markNotificationReadSchema = z.object({
  read: z.boolean().default(true),
});

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
