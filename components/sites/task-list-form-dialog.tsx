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
import { useCreateTaskList, useUpdateTaskList } from '@/hooks/use-hierarchy';
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
  /** Available sections in this tracker (for the "move to section" dropdown). */
  sections: TrackerSection[];
  /** Default section when adding (e.g. the section the user clicked "+" inside). */
  defaultSectionId?: string | null;
  taskList?: TaskList | null;
}

export function TaskListFormDialog({
  open,
  onOpenChange,
  siteTrackerId,
  sections,
  defaultSectionId,
  taskList,
}: Props) {
  const isEdit = !!taskList;
  const createMutation = useCreateTaskList(siteTrackerId);
  const updateMutation = useUpdateTaskList(siteTrackerId);

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
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: taskList?.name ?? '',
      tracker_section_id: taskList?.tracker_section_id ?? defaultSectionId ?? null,
    });
  }, [open, taskList, defaultSectionId, reset]);

  const onSubmit = async (values: TaskListCreateInput) => {
    const payload = {
      ...values,
      tracker_section_id: values.tracker_section_id || null,
    };
    try {
      if (isEdit && taskList) {
        await updateMutation.mutateAsync({ id: taskList.id, input: payload });
        toast.success(`Task list "${values.name}" updated`);
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(`Task list "${values.name}" added`);
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
            <DialogTitle>{isEdit ? 'Edit task list' : 'Add task list'}</DialogTitle>
            <DialogDescription>
              Task lists group related tasks. Optionally nest them under a section.
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
              {isSubmitting ? 'Saving…' : isEdit ? 'Save' : 'Add task list'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
