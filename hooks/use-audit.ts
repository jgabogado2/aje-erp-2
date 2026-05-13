import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { AuditLogPage } from '@/types/domain';
import type { AuditAction, AuditEntityType } from '@/lib/validations/audit';

export interface AuditFilters {
  site_id?: string | null;
  entity_type?: AuditEntityType | null;
  entity_id?: string | null;
  user_id?: string | null;
  action?: AuditAction | null;
  from?: string | null;
  to?: string | null;
}

const PAGE_LIMIT = 50;

function buildQuery(filters: AuditFilters, cursor?: string | null): string {
  const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export function useAuditLog(filters: AuditFilters) {
  return useInfiniteQuery({
    queryKey: ['audit-log', filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiClient.get<AuditLogPage>(`/api/audit-log?${buildQuery(filters, pageParam)}`),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? null,
  });
}
