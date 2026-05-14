'use client';

import { useState } from 'react';
import { format, getYear } from 'date-fns';
import { Plus, Pencil, Trash2, CopyPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageContainer, PageSection, PageCard, PageEmptyState } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';

interface Holiday {
  id: string;
  date: string;
  name: string;
  is_recurring: boolean;
  created_at: string;
}

const CURRENT_YEAR = getYear(new Date());

function useHolidays(year: number) {
  return useQuery({
    queryKey: ['holidays', year],
    queryFn: () => apiClient.get<Holiday[]>(`/api/holidays?year=${year}`),
  });
}

function HolidayForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: Partial<Holiday>;
  onSubmit: (data: { date: string; name: string; is_recurring: boolean }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [date, setDate] = useState(initial?.date ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [recurring, setRecurring] = useState(initial?.is_recurring ?? false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ date, name, is_recurring: recurring });
      }}
      className="grid gap-4"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="h-date">Date</Label>
        <Input
          id="h-date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="h-name">Name</Label>
        <Input
          id="h-name"
          required
          placeholder="e.g. Christmas Day"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={recurring}
          onChange={(e) => setRecurring(e.target.checked)}
          className="h-4 w-4 rounded border"
        />
        Recurring (same month/day every year)
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : initial?.id ? 'Save changes' : 'Add holiday'}
        </Button>
      </div>
    </form>
  );
}

export default function HolidaysPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Holiday | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);

  const qc = useQueryClient();
  const query = useHolidays(year);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['holidays'] });

  const createMutation = useMutation({
    mutationFn: (data: { date: string; name: string; is_recurring: boolean }) =>
      apiClient.post('/api/holidays', data),
    onSuccess: () => { toast.success('Holiday added'); setDialogOpen(false); invalidate(); },
    onError: () => toast.error('Failed to add holiday'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; date: string; name: string; is_recurring: boolean }) =>
      apiClient.patch(`/api/holidays/${id}`, data),
    onSuccess: () => { toast.success('Holiday updated'); setEditTarget(null); invalidate(); },
    onError: () => toast.error('Failed to update holiday'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/holidays/${id}`),
    onSuccess: () => { toast.success('Holiday deleted'); setDeleteTarget(null); invalidate(); },
    onError: () => toast.error('Failed to delete holiday'),
  });

  const copyRecurring = useMutation({
    mutationFn: async () => {
      const holidays = query.data ?? [];
      const recurring = holidays.filter((h) => h.is_recurring);
      const nextYear = year + 1;
      for (const h of recurring) {
        const nextDate = `${nextYear}-${h.date.slice(5)}`;
        await apiClient.post('/api/holidays', { date: nextDate, name: h.name, is_recurring: true });
      }
    },
    onSuccess: () => {
      toast.success(`Recurring holidays copied to ${year + 1}`);
      setYear(year + 1);
      invalidate();
    },
    onError: () => toast.error('Failed to copy holidays'),
  });

  const holidays = query.data ?? [];
  const recurringCount = holidays.filter((h) => h.is_recurring).length;

  return (
    <PageContainer
      title="Holidays"
      description="Manage public and org-specific holidays for skip-holiday rules."
      breadcrumbs={[{ label: 'Admin', href: '/admin/sites' }, { label: 'Holidays' }]}
    >
      <PageSection
        title={`${year} holidays (${holidays.length})`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setYear((y) => y - 1)}
                aria-label="Previous year"
              >
                ‹
              </Button>
              <span className="w-12 text-center text-sm font-medium">{year}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setYear((y) => y + 1)}
                aria-label="Next year"
              >
                ›
              </Button>
            </div>
            {recurringCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyRecurring.mutate()}
                disabled={copyRecurring.isPending}
              >
                <CopyPlus className="mr-2 h-4 w-4" />
                Copy {recurringCount} recurring to {year + 1}
              </Button>
            )}
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add holiday
            </Button>
          </div>
        }
      >
        <PageCard>
          {query.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          ) : holidays.length === 0 ? (
            <PageEmptyState
              title="No holidays yet"
              description="Add holidays to enable skip-holiday rules on daily trackers."
              action={<Button onClick={() => setDialogOpen(true)}>Add first holiday</Button>}
            />
          ) : (
            <ul className="divide-y divide-border">
              {holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium">{h.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(h.date + 'T00:00:00'), 'MMMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {h.is_recurring && <Badge variant="secondary">Recurring</Badge>}
                    <Button variant="ghost" size="icon" onClick={() => setEditTarget(h)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(h)} aria-label="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PageCard>
      </PageSection>

      {/* Add dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add holiday</DialogTitle>
          </DialogHeader>
          <HolidayForm
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => setDialogOpen(false)}
            isPending={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit holiday</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <HolidayForm
              initial={editTarget}
              onSubmit={(data) => updateMutation.mutate({ id: editTarget.id, ...data })}
              onCancel={() => setEditTarget(null)}
              isPending={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete holiday?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
