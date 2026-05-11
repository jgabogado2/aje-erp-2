'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Pencil, Power, Trash2 } from 'lucide-react';
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
import {
  useTrackerCategories,
  useUpdateTrackerCategory,
  useDeleteTrackerCategory,
} from '@/hooks/use-tracker-categories';
import { ApiError } from '@/lib/api-client';
import { TrackerFormDialog } from '@/components/admin/trackers/tracker-form-dialog';
import type { TrackerCategory } from '@/types/domain';
import type { Frequency } from '@/lib/tracker.types';

const FREQ_LABEL: Record<Frequency, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUAL: 'Annual',
  BIR: 'BIR',
  CUSTOM: 'Custom',
};

export default function AdminTrackersPage() {
  const { data: session, status } = useSession();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TrackerCategory | null>(null);
  const [toggleTarget, setToggleTarget] = useState<TrackerCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrackerCategory | null>(null);

  const categoriesQuery = useTrackerCategories();
  const toggleMutation = useUpdateTrackerCategory(toggleTarget?.id ?? '');
  const deleteMutation = useDeleteTrackerCategory();

  if (status === 'loading') return null;
  if (!session?.userRole || session.userRole.role !== 'SUPER_ADMIN') {
    redirect('/unauthorized');
  }

  const categories = categoriesQuery.data ?? [];

  const handleCreate = () => {
    setEditing(null);
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
      const message = err instanceof ApiError ? err.message : 'Failed to update category';
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
      const message = err instanceof ApiError ? err.message : 'Failed to delete category';
      toast.error(message);
    }
  };

  return (
    <PageContainer
      breadcrumbs={[{ label: 'Admin' }, { label: 'Trackers' }]}
      title="Tracker Categories"
      description="Templates that get instantiated when assigned to a site."
      actions={
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New category
        </Button>
      }
    >
      <PageSection>
        <PageCard>
          {categoriesQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : categoriesQuery.isError ? (
            <div className="p-8 text-center text-sm text-destructive">
              Failed to load categories.{' '}
              <Button variant="link" onClick={() => categoriesQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : categories.length === 0 ? (
            <PageEmptyState
              title="No tracker categories yet"
              description="Create your first category to start defining what gets tracked at your sites."
              action={
                <Button onClick={handleCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  New category
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Sections</TableHead>
                  <TableHead>Task lists</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[1%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell>
                      <div className="font-medium">{cat.name}</div>
                      {cat.description && (
                        <div className="truncate text-sm text-muted-foreground max-w-md">
                          {cat.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{FREQ_LABEL[cat.frequency]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {cat.section_templates.length}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {cat.task_list_templates.length}
                    </TableCell>
                    <TableCell>
                      <Badge variant={cat.is_active ? 'default' : 'secondary'}>
                        {cat.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(cat);
                            setFormOpen(true);
                          }}
                          aria-label={`Edit ${cat.name}`}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToggleTarget(cat)}
                          aria-label={
                            cat.is_active ? `Deactivate ${cat.name}` : `Reactivate ${cat.name}`
                          }
                          title={cat.is_active ? 'Deactivate' : 'Reactivate'}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(cat)}
                          aria-label={`Delete ${cat.name}`}
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

        {!categoriesQuery.isLoading && categories.length > 0 && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Total: {categories.length}</span>
            <span>•</span>
            <span>Active: {categories.filter((c) => c.is_active).length}</span>
          </div>
        )}
      </PageSection>

      <TrackerFormDialog open={formOpen} onOpenChange={setFormOpen} category={editing} />

      <AlertDialog
        open={!!toggleTarget}
        onOpenChange={(open) => !open && setToggleTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.is_active ? 'Deactivate category?' : 'Reactivate category?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active
                ? `"${toggleTarget?.name}" will be hidden from the assign dropdown. Existing site assignments are unaffected.`
                : `"${toggleTarget?.name}" will be available for assignment again.`}
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

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; will be removed. If it&apos;s assigned to
              any site you&apos;ll get an error — deactivate it instead or unassign first.
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
