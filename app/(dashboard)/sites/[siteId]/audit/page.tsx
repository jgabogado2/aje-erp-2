'use client';

import { use, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { PageContainer, PageSection, PageCard } from '@/components/layout';
import { AuditTable } from '@/components/audit/audit-table';
import { AuditFiltersBar } from '@/components/audit/audit-filters';
import { useAuditLog, type AuditFilters } from '@/hooks/use-audit';
import { useSite } from '@/hooks/use-sites';

type PageProps = { params: Promise<{ siteId: string }> };

export default function SiteAuditPage({ params }: PageProps) {
  const { siteId } = use(params);
  const router = useRouter();
  const { data: session, status } = useSession();
  const siteQuery = useSite(siteId);
  const [filters, setFilters] = useState<AuditFilters>({ site_id: siteId });
  const query = useAuditLog(filters);

  const rows = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.rows),
    [query.data?.pages]
  );

  if (status === 'loading') return null;
  if (!session) {
    router.replace('/signin');
    return null;
  }
  // SUPER_ADMIN and SITE_MANAGER both allowed; STAFF gets a server 403.
  const role = session.userRole?.role;
  if (role !== 'SUPER_ADMIN' && role !== 'SITE_MANAGER') {
    router.replace('/unauthorized');
    return null;
  }

  return (
    <PageContainer
      breadcrumbs={[
        { label: 'Sites', href: '/admin/sites' },
        { label: siteQuery.data?.name ?? 'Site', href: `/sites/${siteId}` },
        { label: 'Audit log' },
      ]}
      title="Audit log"
      description={`Activity scoped to ${siteQuery.data?.name ?? 'this site'}.`}
    >
      <PageSection>
        <PageCard>
          <AuditFiltersBar
            filters={filters}
            onChange={(next) => setFilters({ ...next, site_id: siteId })}
            lockedSiteId={siteId}
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
