'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Building2,
  AlertCircle,
  Clock3,
  CalendarDays,
  ListChecks,
  Settings2,
} from 'lucide-react';
import {
  PageContainer,
  PageSection,
  PageCard,
  PageEmptyState,
} from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useSites } from '@/hooks/use-sites';
import { useSiteTrackers } from '@/hooks/use-site-trackers';
import { useDashboardSummary } from '@/hooks/use-dashboard-summary';
import { useAppStore } from '@/stores/app-store';
import { getNavCapabilities } from '@/lib/nav';
import type { DashboardSummary } from '@/types/domain';

type TabKey = 'trackers' | 'overdue' | 'upcoming';

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'trackers', label: 'All trackers', icon: ListChecks },
  { key: 'overdue', label: 'Overdue', icon: Clock3 },
  { key: 'upcoming', label: 'Upcoming', icon: CalendarDays },
];

function isTabKey(value: string | null): value is TabKey {
  return value === 'trackers' || value === 'overdue' || value === 'upcoming';
}

export default function TrackersPage() {
  return (
    <Suspense fallback={null}>
      <TrackersHub />
    </Suspense>
  );
}

function TrackersHub() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<TabKey>(isTabKey(initialTab) ? initialTab : 'trackers');

  const currentSiteId = useAppStore((s) => s.currentSiteId);
  const sitesQuery = useSites();
  const sites = sitesQuery.data ?? [];
  const currentSite = sites.find((s) => s.id === currentSiteId) ?? null;

  const caps = getNavCapabilities(session?.userRole?.role);

  const selectTab = (next: TabKey) => {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/trackers?${params.toString()}`, { scroll: false });
  };

  if (status === 'loading') return null;

  return (
    <PageContainer
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Trackers' }]}
      title="Trackers"
      description="Trackers for the site you're currently working in. Switch sites from the selector in the top bar."
      actions={
        caps.canManageTrackers ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/trackers">
              <Settings2 className="mr-2 h-4 w-4" />
              Manage templates
            </Link>
          </Button>
        ) : undefined
      }
    >
      {sitesQuery.isLoading ? (
        <PageCard>
          <div className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </PageCard>
      ) : sites.length === 0 ? (
        <PageCard>
          <PageEmptyState
            icon={<AlertCircle className="h-8 w-8" />}
            title="No site access yet"
            description="You haven't been assigned to any sites. Ask a Super Admin to add you to a site so you can start working with trackers."
          />
        </PageCard>
      ) : !currentSite ? (
        <PageCard>
          <PageEmptyState
            icon={<Building2 className="h-8 w-8" />}
            title="Pick a site"
            description="Choose a site from the selector in the top bar to see its trackers."
          />
        </PageCard>
      ) : (
        <>
          <PageCard className="flex items-center gap-4">
            <div className="rounded-lg bg-primary/10 p-3">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Current site
              </p>
              <p className="truncate text-lg font-semibold">{currentSite.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {currentSite.code}
              </p>
            </div>
          </PageCard>

          <div
            role="tablist"
            aria-label="Tracker views"
            className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1"
          >
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => selectTab(key)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  tab === key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {tab === 'trackers' && <TrackersTab siteId={currentSite.id} />}
          {tab === 'overdue' && <EntriesTab siteId={currentSite.id} kind="overdue" />}
          {tab === 'upcoming' && <EntriesTab siteId={currentSite.id} kind="upcoming" />}
        </>
      )}
    </PageContainer>
  );
}

function TrackersTab({ siteId }: { siteId: string }) {
  const year = new Date().getFullYear();
  const trackersQuery = useSiteTrackers(siteId, year);
  const trackers = trackersQuery.data ?? [];
  const router = useRouter();

  return (
    <PageSection
      title={`Trackers for ${year}`}
      description="Open a tracker to view and update its tasks."
    >
      <PageCard>
        {trackersQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : trackersQuery.isError ? (
          <div className="p-8 text-center text-sm text-destructive">
            Failed to load trackers.{' '}
            <Button variant="link" onClick={() => trackersQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : trackers.length === 0 ? (
          <PageEmptyState
            icon={<ListChecks className="h-8 w-8" />}
            title="No trackers assigned for this year"
            description="A Super Admin needs to assign tracker categories to this site before they show up here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trackers.map((t) => {
                const href = `/sites/${siteId}/trackers/${t.id}`;
                return (
                  <TableRow
                    key={t.id}
                    onClick={() => router.push(href)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(href);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open ${t.tracker_category.name}`}
                    className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <TableCell>
                      <Link
                        href={href}
                        className="font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t.tracker_category.name}
                      </Link>
                      {t.tracker_category.description && (
                        <div className="max-w-md truncate text-sm text-muted-foreground">
                          {t.tracker_category.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.tracker_category.frequency}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.is_active ? 'default' : 'secondary'}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </PageCard>
    </PageSection>
  );
}

function EntriesTab({
  siteId,
  kind,
}: {
  siteId: string;
  kind: 'overdue' | 'upcoming';
}) {
  const summaryQuery = useDashboardSummary({ site_id: siteId });
  const entries =
    kind === 'overdue'
      ? summaryQuery.data?.overdue_entries ?? []
      : summaryQuery.data?.upcoming_entries ?? [];

  const copy =
    kind === 'overdue'
      ? {
          title: 'Overdue entries',
          description: 'Task entries past their due date that still need attention.',
          empty: 'Nothing overdue. Everything is on track.',
        }
      : {
          title: 'Upcoming entries',
          description: 'Task entries due within the next 7 days.',
          empty: 'Nothing due in the next 7 days.',
        };

  return (
    <PageSection title={copy.title} description={copy.description}>
      <PageCard>
        {summaryQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : summaryQuery.isError ? (
          <div className="p-8 text-center text-sm text-destructive">
            Failed to load entries.{' '}
            <Button variant="link" onClick={() => summaryQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{copy.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} fallbackSiteId={siteId} />
            ))}
          </ul>
        )}
      </PageCard>
    </PageSection>
  );
}

function EntryRow({
  entry,
  fallbackSiteId,
}: {
  entry: DashboardSummary['overdue_entries'][number];
  fallbackSiteId: string;
}) {
  const siteId = entry.task_list?.site_id ?? fallbackSiteId;
  const trackerId = entry.task_list?.site_tracker_id;
  const href = trackerId
    ? `/sites/${siteId}/trackers/${trackerId}/tasks/${entry.task_list_id}`
    : null;

  const body = (
    <>
      <p className="truncate text-sm font-medium">
        {entry.task_list?.name ?? 'Task entry'}
      </p>
      <p className="text-xs text-muted-foreground">
        {entry.period_label} · due {entry.due_date}
      </p>
    </>
  );

  if (!href) {
    return <li className="py-3 first:pt-0 last:pb-0">{body}</li>;
  }

  return (
    <li className="first:pt-0 last:pb-0">
      <Link
        href={href}
        className="block rounded-md py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
      >
        {body}
      </Link>
    </li>
  );
}
