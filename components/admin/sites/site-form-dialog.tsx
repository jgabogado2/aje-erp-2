'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { siteCreateSchema } from '@/lib/validations/site';
import type { SiteCreateInput, SiteUpdateInput } from '@/lib/validations/site';
import { useCreateSite, useUpdateSite } from '@/hooks/use-sites';
import type { Site } from '@/types/domain';
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

interface SiteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog is in edit mode. */
  site?: Site | null;
}

type FormValues = SiteCreateInput;

export function SiteFormDialog({ open, onOpenChange, site }: SiteFormDialogProps) {
  const isEdit = !!site;
  const createMutation = useCreateSite();
  const updateMutation = useUpdateSite(site?.id ?? '');

  // Same fields in both modes — the API enforces the difference (update
  // accepts partials; create requires code+name). Validating with the
  // stricter create schema keeps the client UX consistent.
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(siteCreateSchema),
    defaultValues: { code: '', name: '', address: null },
  });

  useEffect(() => {
    if (!open) return;
    reset(
      site
        ? { code: site.code, name: site.name, address: site.address ?? null }
        : { code: '', name: '', address: null }
    );
  }, [open, site, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEdit && site) {
        const patch: SiteUpdateInput = {
          code: values.code,
          name: values.name,
          address: values.address ?? null,
        };
        await updateMutation.mutateAsync(patch);
        toast.success(`Site "${values.name}" updated`);
      } else {
        await createMutation.mutateAsync({
          code: values.code,
          name: values.name,
          address: values.address ?? null,
        });
        toast.success(`Site "${values.name}" created`);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong';
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit site' : 'Create site'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Update the site details. Codes are unique within your organization.'
                : 'Add a new office or location under your organization.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="site-code">Code</Label>
              <Input
                id="site-code"
                placeholder="e.g. SITE-MNL-01"
                autoComplete="off"
                {...register('code')}
              />
              {errors.code && (
                <p className="text-sm text-destructive">{errors.code.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="site-name">Name</Label>
              <Input id="site-name" placeholder="Manila Head Office" {...register('name')} />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="site-address">Address (optional)</Label>
              <Input id="site-address" placeholder="Street, City" {...register('address')} />
              {errors.address && (
                <p className="text-sm text-destructive">{errors.address.message}</p>
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
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create site'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
