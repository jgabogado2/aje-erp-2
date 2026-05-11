'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { taskCreateSchema, type TaskCreateInput } from '@/lib/validations/task';
import { FREQUENCIES, type Frequency } from '@/lib/tracker.types';
import { useCreateTask, useUpdateTask } from '@/hooks/use-hierarchy';
import { useSiteUsers } from '@/hooks/use-sites';
import type { Task } from '@/types/domain';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  siteTrackerId: string;
  taskListId: string;
  defaultFrequency: Frequency;
  task?: Task | null;
}

const FREQ_LABEL: Record<Frequency, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUAL: 'Annual',
  BIR: 'BIR',
  CUSTOM: 'Custom',
};

export function TaskFormDialog({
  open,
  onOpenChange,
  siteId,
  siteTrackerId,
  taskListId,
  defaultFrequency,
  task,
}: Props) {
  const isEdit = !!task;
  const createMutation = useCreateTask(siteTrackerId);
  const updateMutation = useUpdateTask(siteTrackerId);
  const usersQuery = useSiteUsers(siteId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskCreateInput>({
    resolver: zodResolver(taskCreateSchema),
    defaultValues: {
      name: '',
      assigned_to: null,
      frequency: defaultFrequency,
      skip_weekends: false,
      skip_holidays: false,
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: task?.name ?? '',
      assigned_to: task?.assigned_to ?? null,
      frequency: task?.frequency ?? defaultFrequency,
      skip_weekends: task?.skip_weekends ?? false,
      skip_holidays: task?.skip_holidays ?? false,
    });
  }, [open, task, defaultFrequency, reset]);

  const assignees = (usersQuery.data ?? [])
    .map((u) => u.user)
    .filter((u): u is NonNullable<typeof u> => !!u);

  const onSubmit = async (values: TaskCreateInput) => {
    const payload = {
      ...values,
      assigned_to: values.assigned_to || null,
    };
    try {
      if (isEdit && task) {
        await updateMutation.mutateAsync({ id: task.id, input: payload });
        toast.success(`Task "${values.name}" updated`);
      } else {
        await createMutation.mutateAsync({ taskListId, input: payload });
        toast.success(`Task "${values.name}" added`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit task' : 'Add task'}</DialogTitle>
            <DialogDescription>
              Tasks generate per-period entries based on their frequency.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="t-name">Name</Label>
              <Input id="t-name" placeholder="e.g. Submit DCR to FRG" {...register('name')} />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="t-assignee">Assigned to</Label>
              <Select id="t-assignee" {...register('assigned_to')}>
                <option value="">(unassigned)</option>
                {assignees.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="t-freq">Frequency</Label>
              <Select id="t-freq" {...register('frequency')}>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQ_LABEL[f]}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Defaults to the tracker&apos;s frequency. Override only when this task
                runs on a different cadence.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Period skip rules</Label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" {...register('skip_weekends')} className="h-4 w-4" />
                Skip weekends
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" {...register('skip_holidays')} className="h-4 w-4" />
                Skip holidays
              </label>
              <p className="text-xs text-muted-foreground">
                Only meaningful for Daily and Weekly tasks.
              </p>
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save' : 'Add task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
