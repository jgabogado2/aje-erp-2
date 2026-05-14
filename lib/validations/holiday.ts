import { z } from 'zod';

export const holidayCreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  name: z.string().min(1).max(200),
  is_recurring: z.boolean().default(false),
});

export const holidayUpdateSchema = holidayCreateSchema.partial();

export const holidayQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
});

export type HolidayCreate = z.infer<typeof holidayCreateSchema>;
export type HolidayUpdate = z.infer<typeof holidayUpdateSchema>;
