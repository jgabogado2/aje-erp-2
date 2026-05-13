'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  Building2,
  Users,
  AlertCircle,
  CheckCircle2,
  Clock3,
  CalendarDays,
  Download,
  FileSpreadsheet,
  FileText,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSites } from '@/hooks/use-sites';
import { useUsers } from '@/hooks/use-users';
import { useDashboardSummary } from '@/hooks/use-dashboard-summary';
import { useAppStore } from '@/stores/app-store';
import type { SystemRole } from '@/lib/auth.types';

const ROLE_LABEL: Record<SystemRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  SITE_MANAGER: 'Site Manager',
  STAFF: 'Staff',
};

function StatCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <PageCard className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="rounded-lg bg-primary/10 p-3">
        <Icon className="h-5 w-5 text-primary" />
      </div>
    </PageCard>
  );
}

function SuperAdminDashboard() {
  const sitesQuery = useSites();
  const usersQuery = useUsers();
  const summaryQuery = useDashboardSummary();

  const sites = sitesQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const summary = summaryQuery.data;

  return (
    <>
      <div className="flex justify-end">
        <DashboardExportDropdown />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sites"
          value={sitesQuery.isLoading ? '—' : sites.length}
          description={`${sites.filter((s) => s.is_active).length} active`}
          icon={Building2}
        />
        <StatCard
          label="Members"
          value={usersQuery.isLoading ? '—' : users.length}
          description={`${users.filter((u) => u.is_active).length} active`}
          icon={Users}
        />
        <StatCard
          label="Completion"
          value={summaryQuery.isLoading ? '—' : `${summary?.completion_rate ?? 0}%`}
          description={`${summary?.entries_total ?? 0} entries tracked`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Overdue"
          value={summaryQuery.isLoading ? '—' : summary?.overdue_count ?? 0}
          description={`${summary?.due_next_7_days ?? 0} due in 7 days`}
          icon={Clock3}
        />
      </div>

      <DashboardLists summary={summary} />

      <PageSection
        title="Sites"
        description="Offices and locations under your organization."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/sites">Manage</Link>
          </Button>
        }
      >
        <PageCard>
          {sitesQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : sites.length === 0 ? (
            <PageEmptyState
              title="No sites yet"
              description="Create your first site to start assigning trackers and users."
              action={
                <Button asChild>
                  <Link href="/admin/sites">Create a site</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {sites.slice(0, 6).map((site) => (
                <li
                  key={site.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{site.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {site.code}
                    </p>
                  </div>
                  <Badge variant={site.is_active ? 'default' : 'secondary'}>
                    {site.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </PageCard>
      </PageSection>
    </>
  );
}

function MemberDashboard({ role }: { role: SystemRole }) {
  const sitesQuery = useSites();
  const currentSiteId = useAppStore((s) => s.currentSiteId);
  const summaryQuery = useDashboardSummary(
    currentSiteId ? { site_id: currentSiteId } : undefined
  );
  const sites = sitesQuery.data ?? [];
  const currentSite = sites.find((s) => s.id === currentSiteId) ?? null;

  if (sitesQuery.isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading your sites…</div>
    );
  }

  if (sites.length === 0) {
    return (
      <PageCard>
        <PageEmptyState
          icon={<AlertCircle className="h-8 w-8" />}
          title="No site access yet"
          description="You haven't been assigned to any sites yet. Ask a Super Admin to add you to a site so you can start working."
        />
      </PageCard>
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <DashboardExportDropdown siteId={currentSiteId ?? undefined} />
      </div>

      <PageCard>
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-primary/10 p-3">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Current site
            </p>
            <p className="truncate text-xl font-semibold">
              {currentSite?.name ?? 'Pick a site from the switcher above'}
            </p>
            {currentSite && (
              <p className="font-mono text-xs text-muted-foreground">
                {currentSite.code}
              </p>
            )}
          </div>
          <Badge variant="secondary">{ROLE_LABEL[role]}</Badge>
        </div>
      </PageCard>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Completion"
          value={summaryQuery.isLoading ? '—' : `${summaryQuery.data?.completion_rate ?? 0}%`}
          description={`${summaryQuery.data?.entries_total ?? 0} entries tracked`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Overdue"
          value={summaryQuery.isLoading ? '—' : summaryQuery.data?.overdue_count ?? 0}
          description="Need attention"
          icon={Clock3}
        />
        <StatCard
          label="Due soon"
          value={summaryQuery.isLoading ? '—' : summaryQuery.data?.due_next_7_days ?? 0}
          description="Next 7 days"
          icon={CalendarDays}
        />
      </div>

      <DashboardLists summary={summaryQuery.data} />
    </>
  );
}

function DashboardExportDropdown({ siteId }: { siteId?: string }) {
  const qs = siteId ? `?site_id=${encodeURIComponent(siteId)}` : '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Export summary
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={`/api/dashboard/export.xlsx${qs}`}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`/api/dashboard/export.pdf${qs}`}>
            <FileText className="h-4 w-4" />
            PDF
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DashboardLists({ summary }: { summary?: ReturnType<typeof useDashboardSummary>['data'] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PageSection title="Overdue">
        <PageCard>
          {summary?.overdue_entries.length ? (
            <ul className="divide-y">
              {summary.overdue_entries.map((entry) => (
                <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium">{entry.task_list?.name ?? 'Task entry'}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.period_label} · due {entry.due_date}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No overdue entries.</p>
          )}
        </PageCard>
      </PageSection>
      <PageSection title="Upcoming">
        <PageCard>
          {summary?.upcoming_entries.length ? (
            <ul className="divide-y">
              {summary.upcoming_entries.map((entry) => (
                <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium">{entry.task_list?.name ?? 'Task entry'}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.period_label} · due {entry.due_date}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing due in the next 7 days.</p>
          )}
        </PageCard>
      </PageSection>
    </div>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();

  if (status === 'loading') return null;

  const role = session?.userRole?.role;
  const name = session?.user?.name?.split(' ')[0] ?? 'there';

  return (
    <PageContainer
      title={`Welcome back, ${name}`}
      description="Your day at a glance."
      breadcrumbs={[{ label: 'Home' }]}
    >
      <div className="space-y-8">
        {role === 'SUPER_ADMIN' ? (
          <SuperAdminDashboard />
        ) : role ? (
          <MemberDashboard role={role} />
        ) : (
          <PageCard>
            <PageEmptyState
              icon={<AlertCircle className="h-8 w-8" />}
              title="Account not provisioned"
              description="Your account hasn't been linked to an organization yet. Contact your administrator."
            />
          </PageCard>
        )}
      </div>
    </PageContainer>
  );
}
