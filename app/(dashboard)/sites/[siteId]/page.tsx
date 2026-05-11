'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, Building2 } from 'lucide-react';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSite } from '@/hooks/use-sites';
import {
  useSiteTrackers,
  useUnassignSiteTracker,
} from '@/hooks/use-site-trackers';
import { ApiError } from '@/lib/api-client';
import { AssignTrackerDialog } from '@/components/sites/assign-tracker-dialog';
import type { SiteTrackerWithCategory } from '@/types/domain';

type PageProps = { params: Promise<{ siteId: string }> };

export default function SiteDetailPage({ params }: PageProps) {
  const { siteId } = use(params);
  const router = useRouter();
  const { data: session, status } = useSession();
  const [year] = useState(() => new Date().getFullYear());
  const [assignOpen, setAssignOpen] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState<SiteTrackerWithCategory | null>(null);

  const siteQuery = useSite(siteId);
  const trackersQuery = useSiteTrackers(siteId, year);
  const unassignMutation = useUnassignSiteTracker(siteId, year);

  if (status === 'loading') return null;
  if (!session) {
    router.replace('/signin');
    return null;
  }

  const site = siteQuery.data;
  const trackers = trackersQuery.data ?? [];
  const isSuperAdmin = session.userRole?.role === 'SUPER_ADMIN';

  const confirmUnassign = async () => {
    if (!unassignTarget) return;
    try {
      await unassignMutation.mutateAsync(unassignTarget.id);
      toast.success('Tracker unassigned');
      setUnassignTarget(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to unassign';
      toast.error(message);
    }
  };

  if (siteQuery.isError) {
    return (
      <PageContainer title="Site" breadcrumbs={[{ label: 'Sites' }]}>
        <PageCard>
          <div className="p-8 text-center text-sm text-destructive">
            {siteQuery.error instanceof ApiError && siteQuery.error.status === 403
              ? 'You do not have access to this site.'
              : 'Failed to load site.'}
          </div>
        </PageCard>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      breadcrumbs={[
        { label: 'Sites', href: '/admin/sites' },
        { label: site?.name ?? 'Site' },
      ]}
      title={site?.name ?? 'Loading…'}
      description={site ? `${site.code}${site.address ? ` · ${site.address}` : ''}` : undefined}
      actions={
        isSuperAdmin && (
          <Button onClick={() => setAssignOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Assign tracker
          </Button>
        )
      }
    >
      <PageSection
        title={`Trackers for ${year}`}
        description="Categories currently assigned to this site for the selected year."
      >
        <PageCard>
          {trackersQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : trackers.length === 0 ? (
            <PageEmptyState
              icon={<Building2 className="h-8 w-8" />}
              title="No trackers assigned for this year"
              description={
                isSuperAdmin
                  ? 'Assign a tracker category to start tracking work at this site.'
                  : 'A Super Admin needs to assign trackers to this site.'
              }
              action={
                isSuperAdmin ? (
                  <Button onClick={() => setAssignOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Assign tracker
                  </Button>
                ) : null
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[1%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trackers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link
                        href={`/sites/${siteId}/trackers/${t.id}`}
                        className="font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        {t.tracker_category.name}
                      </Link>
                      {t.tracker_category.description && (
                        <div className="truncate text-sm text-muted-foreground max-w-md">
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
                    <TableCell className="text-right">
                      {isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setUnassignTarget(t)}
                          aria-label="Unassign tracker"
                          title="Unassign"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PageCard>
      </PageSection>

      <AssignTrackerDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        siteId={siteId}
        year={year}
      />

      <AlertDialog
        open={!!unassignTarget}
        onOpenChange={(open) => !open && setUnassignTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unassign tracker?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{unassignTarget?.tracker_category.name}&quot; will be removed from
              this site for {year}. Once Phase 2b/2c add task data, any existing
              tasks and entries will need to be unassigned first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unassignMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUnassign}
              disabled={unassignMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unassignMutation.isPending ? 'Unassigning…' : 'Unassign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
