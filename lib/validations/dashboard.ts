import { z } from 'zod';

export const dashboardSummaryQuerySchema = z.object({
  site_id: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type DashboardSummaryQuery = z.infer<typeof dashboardSummaryQuerySchema>;
