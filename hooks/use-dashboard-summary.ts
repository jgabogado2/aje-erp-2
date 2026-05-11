import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { DashboardSummary } from '@/types/domain';
import type { DashboardSummaryQuery } from '@/lib/validations/dashboard';

function toQueryString(query?: DashboardSummaryQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useDashboardSummary(query?: DashboardSummaryQuery) {
  return useQuery({
    queryKey: ['dashboard-summary', query ?? {}],
    queryFn: () =>
      apiClient.get<DashboardSummary>(`/api/dashboard/summary${toQueryString(query)}`),
  });
}
