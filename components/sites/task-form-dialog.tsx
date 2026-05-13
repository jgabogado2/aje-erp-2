'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { taskCreateSchema, type TaskCreateInput } from '@/lib/validations/task';
import { useCreateTask, useUpdateTask } from '@/hooks/use-hierarchy';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteTrackerId: string;
  taskListId: string;
  task?: Task | null;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  siteTrackerId,
  taskListId,
  task,
}: Props) {
  const isEdit = !!task;
  const createMutation = useCreateTask(siteTrackerId);
  const updateMutation = useUpdateTask(siteTrackerId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskCreateInput>({
    resolver: zodResolver(taskCreateSchema),
    defaultValues: {
      name: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: task?.name ?? '',
    });
  }, [open, task, reset]);

  const onSubmit = async (values: TaskCreateInput) => {
    try {
      if (isEdit && task) {
        await updateMutation.mutateAsync({ id: task.id, input: values });
        toast.success(`Subtask "${values.name}" updated`);
      } else {
        await createMutation.mutateAsync({ taskListId, input: values });
        toast.success(`Subtask "${values.name}" added`);
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
            <DialogTitle>{isEdit ? 'Edit subtask' : 'Add subtask'}</DialogTitle>
            <DialogDescription>
              Subtasks are optional checklist items inside each task item entry.
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
              {isSubmitting ? 'Saving…' : isEdit ? 'Save' : 'Add subtask'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
