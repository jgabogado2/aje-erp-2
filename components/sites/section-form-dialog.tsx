'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import {
  sectionCreateSchema,
  type SectionCreateInput,
} from '@/lib/validations/section';
import { useCreateSection, useUpdateSection } from '@/hooks/use-hierarchy';
import type { TrackerSection } from '@/types/domain';
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
  section?: TrackerSection | null;
}

export function SectionFormDialog({ open, onOpenChange, siteTrackerId, section }: Props) {
  const isEdit = !!section;
  const createMutation = useCreateSection(siteTrackerId);
  const updateMutation = useUpdateSection(siteTrackerId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SectionCreateInput>({
    resolver: zodResolver(sectionCreateSchema),
    defaultValues: { name: '' },
  });

  useEffect(() => {
    if (open) reset({ name: section?.name ?? '' });
  }, [open, section, reset]);

  const onSubmit = async (values: SectionCreateInput) => {
    try {
      if (isEdit && section) {
        await updateMutation.mutateAsync({ id: section.id, input: { name: values.name } });
        toast.success(`Section "${values.name}" updated`);
      } else {
        await createMutation.mutateAsync(values);
        toast.success(`Section "${values.name}" added`);
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
            <DialogTitle>{isEdit ? 'Rename section' : 'Add section'}</DialogTitle>
            <DialogDescription>
              Sections group task lists in this tracker.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="sec-name">Name</Label>
            <Input id="sec-name" placeholder="e.g. EWT Recon" {...register('name')} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
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
              {isSubmitting ? 'Saving…' : isEdit ? 'Save' : 'Add section'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
