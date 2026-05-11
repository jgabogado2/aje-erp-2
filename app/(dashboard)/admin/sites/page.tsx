'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Pencil, Power, Trash2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
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
import { useSites, useUpdateSite, useDeleteSite } from '@/hooks/use-sites';
import { ApiError } from '@/lib/api-client';
import { SiteFormDialog } from '@/components/admin/sites/site-form-dialog';
import type { Site } from '@/types/domain';

export default function AdminSitesPage() {
  const { data: session, status } = useSession();
  const [formOpen, setFormOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Site | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);

  const sitesQuery = useSites();
  // The toggle mutation needs the row id, so we rebuild it per-target. This
  // is fine — the toggle dialog renders one at a time.
  const toggleMutation = useUpdateSite(toggleTarget?.id ?? '');
  const deleteMutation = useDeleteSite();

  if (status === 'loading') return null;
  if (!session?.userRole || session.userRole.role !== 'SUPER_ADMIN') {
    redirect('/unauthorized');
  }

  const sites = sitesQuery.data ?? [];

  const handleEdit = (site: Site) => {
    setEditingSite(site);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setEditingSite(null);
    setFormOpen(true);
  };

  const confirmToggle = async () => {
    if (!toggleTarget) return;
    try {
      await toggleMutation.mutateAsync({ is_active: !toggleTarget.is_active });
      toast.success(
        `"${toggleTarget.name}" ${toggleTarget.is_active ? 'deactivated' : 'reactivated'}`
      );
      setToggleTarget(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to update site';
      toast.error(message);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to delete site';
      toast.error(message);
    }
  };

  return (
    <PageContainer
      breadcrumbs={[{ label: 'Admin' }, { label: 'Sites' }]}
      title="Sites"
      description="Manage offices and locations under your organization."
      actions={
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New site
        </Button>
      }
    >
      <PageSection>
        <PageCard>
          {sitesQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading sites…</div>
          ) : sitesQuery.isError ? (
            <div className="p-8 text-center text-sm text-destructive">
              Failed to load sites.{' '}
              <Button variant="link" onClick={() => sitesQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : sites.length === 0 ? (
            <PageEmptyState
              title="No sites yet"
              description="Create your first site to start assigning trackers and users."
              action={
                <Button onClick={handleCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  New site
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[1%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((site) => (
                  <TableRow key={site.id}>
                    <TableCell className="font-mono text-sm">{site.code}</TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/sites/${site.id}`}
                        className="hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        {site.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {site.address || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={site.is_active ? 'default' : 'secondary'}>
                        {site.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(site)}
                          aria-label={`Edit ${site.name}`}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToggleTarget(site)}
                          aria-label={
                            site.is_active
                              ? `Deactivate ${site.name}`
                              : `Reactivate ${site.name}`
                          }
                          title={site.is_active ? 'Deactivate' : 'Reactivate'}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(site)}
                          aria-label={`Delete ${site.name}`}
                          title="Delete permanently"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PageCard>

        {!sitesQuery.isLoading && sites.length > 0 && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Total: {sites.length}</span>
            <span>•</span>
            <span>Active: {sites.filter((s) => s.is_active).length}</span>
          </div>
        )}
      </PageSection>

      <SiteFormDialog open={formOpen} onOpenChange={setFormOpen} site={editingSite} />

      {/* Deactivate / reactivate */}
      <AlertDialog
        open={!!toggleTarget}
        onOpenChange={(open) => !open && setToggleTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.is_active ? 'Deactivate site?' : 'Reactivate site?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active
                ? `"${toggleTarget?.name}" will be hidden from active views. Existing trackers, tasks, and assignments are preserved — you can reactivate any time.`
                : `"${toggleTarget?.name}" will be visible in active views again with all its existing data intact.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggle} disabled={toggleMutation.isPending}>
              {toggleMutation.isPending
                ? 'Working…'
                : toggleTarget?.is_active
                  ? 'Deactivate'
                  : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent delete */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this site?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; ({deleteTarget?.code}) and all its user
              assignments will be removed. This cannot be undone. If you only want to
              hide the site, deactivate it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
