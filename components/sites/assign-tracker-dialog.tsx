'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import {
  siteTrackerAssignSchema,
  type SiteTrackerAssignInput,
} from '@/lib/validations/tracker';
import { useTrackerCategories } from '@/hooks/use-tracker-categories';
import { useAssignSiteTracker } from '@/hooks/use-site-trackers';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface AssignTrackerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  year: number;
}

export function AssignTrackerDialog({
  open,
  onOpenChange,
  siteId,
  year,
}: AssignTrackerDialogProps) {
  const categoriesQuery = useTrackerCategories();
  const assignMutation = useAssignSiteTracker(siteId, year);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SiteTrackerAssignInput>({
    resolver: zodResolver(siteTrackerAssignSchema),
    defaultValues: { tracker_category_id: '', year },
  });

  useEffect(() => {
    if (open) reset({ tracker_category_id: '', year });
  }, [open, year, reset]);

  const active = (categoriesQuery.data ?? []).filter((c) => c.is_active);

  const onSubmit = async (values: SiteTrackerAssignInput) => {
    try {
      await assignMutation.mutateAsync(values);
      toast.success('Tracker assigned');
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to assign tracker';
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Assign tracker</DialogTitle>
            <DialogDescription>
              Pick a category to add to this site for {year}. Sections and task lists
              defined on the category will be available after Phase 2b lands.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="at-category">Tracker category</Label>
              <Select id="at-category" {...register('tracker_category_id')}>
                <option value="">— Select a category —</option>
                {active.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.frequency}
                  </option>
                ))}
              </Select>
              {errors.tracker_category_id && (
                <p className="text-sm text-destructive">
                  {errors.tracker_category_id.message}
                </p>
              )}
              {active.length === 0 && !categoriesQuery.isLoading && (
                <p className="text-xs text-muted-foreground">
                  No active categories yet. Create one in Admin → Trackers first.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="at-year">Year</Label>
              <Input
                id="at-year"
                type="number"
                {...register('year', { valueAsNumber: true })}
              />
              {errors.year && (
                <p className="text-sm text-destructive">{errors.year.message}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || active.length === 0}>
              {isSubmitting ? 'Assigning…' : 'Assign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
