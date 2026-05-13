'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { PageContainer, PageSection, PageCard } from '@/components/layout';
import { AuditTable } from '@/components/audit/audit-table';
import { AuditFiltersBar } from '@/components/audit/audit-filters';
import { useAuditLog, type AuditFilters } from '@/hooks/use-audit';
import { useSites } from '@/hooks/use-sites';

export default function AdminAuditPage() {
  const { data: session, status } = useSession();
  const [filters, setFilters] = useState<AuditFilters>({});
  const sitesQuery = useSites();
  const query = useAuditLog(filters);

  const rows = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.rows),
    [query.data?.pages]
  );

  if (status === 'loading') return null;
  if (!session?.userRole || session.userRole.role !== 'SUPER_ADMIN') {
    redirect('/unauthorized');
  }

  return (
    <PageContainer
      breadcrumbs={[{ label: 'Admin' }, { label: 'Audit log' }]}
      title="Audit log"
      description="Every status change and structural edit across your organization."
    >
      <PageSection>
        <PageCard>
          <AuditFiltersBar
            filters={filters}
            onChange={setFilters}
            sites={sitesQuery.data ?? []}
          />
        </PageCard>
      </PageSection>

      <PageSection>
        <AuditTable
          rows={rows}
          isLoading={query.isLoading}
          hasMore={!!query.hasNextPage}
          onLoadMore={() => query.fetchNextPage()}
          isLoadingMore={query.isFetchingNextPage}
        />
      </PageSection>
    </PageContainer>
  );
}
