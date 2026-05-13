'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import {
  taskListCreateSchema,
  type TaskListCreateInput,
} from '@/lib/validations/task-list';
import { FREQUENCIES, type Frequency } from '@/lib/tracker.types';
import { useCreateTaskList, useUpdateTaskList } from '@/hooks/use-hierarchy';
import { useSiteUsers } from '@/hooks/use-sites';
import type { TaskList, TrackerSection } from '@/types/domain';
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
  siteTrackerId: string;
  siteId: string;
  /** Available sections in this tracker (for the "move to section" dropdown). */
  sections: TrackerSection[];
  /** Default section when adding (e.g. the section the user clicked "+" inside). */
  defaultSectionId?: string | null;
  defaultFrequency: Frequency;
  taskList?: TaskList | null;
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

export function TaskListFormDialog({
  open,
  onOpenChange,
  siteTrackerId,
  siteId,
  sections,
  defaultSectionId,
  defaultFrequency,
  taskList,
}: Props) {
  const isEdit = !!taskList;
  const createMutation = useCreateTaskList(siteTrackerId);
  const updateMutation = useUpdateTaskList(siteTrackerId);
  const usersQuery = useSiteUsers(siteId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskListCreateInput>({
    resolver: zodResolver(taskListCreateSchema),
    defaultValues: {
      name: '',
      tracker_section_id: defaultSectionId ?? null,
      frequency: defaultFrequency,
      assigned_to: null,
      skip_weekends: false,
      skip_holidays: false,
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: taskList?.name ?? '',
      tracker_section_id: taskList?.tracker_section_id ?? defaultSectionId ?? null,
      frequency: taskList?.frequency ?? defaultFrequency,
      assigned_to: taskList?.assigned_to ?? null,
      skip_weekends: taskList?.skip_weekends ?? false,
      skip_holidays: taskList?.skip_holidays ?? false,
    });
  }, [open, taskList, defaultSectionId, defaultFrequency, reset]);

  const assignees = (usersQuery.data ?? [])
    .map((u) => u.user)
    .filter((u): u is NonNullable<typeof u> => !!u);

  const onSubmit = async (values: TaskListCreateInput) => {
    const payload = {
      ...values,
      tracker_section_id: values.tracker_section_id || null,
      assigned_to: values.assigned_to || null,
    };
    try {
      if (isEdit && taskList) {
        await updateMutation.mutateAsync({ id: taskList.id, input: payload });
        toast.success(`Task item "${values.name}" updated`);
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(`Task item "${values.name}" added`);
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
            <DialogTitle>{isEdit ? 'Edit task item' : 'Add task item'}</DialogTitle>
            <DialogDescription>
              Task items generate entries. Subtasks can be added after saving.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tl-name">Name</Label>
              <Input id="tl-name" placeholder="e.g. DCR Submission" {...register('name')} />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tl-section">Section</Label>
              <Select id="tl-section" {...register('tracker_section_id')}>
                <option value="">(ungrouped)</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tl-assignee">Assigned to</Label>
              <Select id="tl-assignee" {...register('assigned_to')}>
                <option value="">(unassigned)</option>
                {assignees.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tl-frequency">Frequency</Label>
              <Select id="tl-frequency" {...register('frequency')}>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQ_LABEL[f]}
                  </option>
                ))}
              </Select>
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
              {isSubmitting ? 'Saving…' : isEdit ? 'Save' : 'Add task item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
