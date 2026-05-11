'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import {
  userInviteSchema,
  type UserInviteInput,
} from '@/lib/validations/user';
import { useInviteUser, useUpdateUser } from '@/hooks/use-users';
import type { OrganizationMember } from '@/types/domain';
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

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog is in edit mode. */
  member?: OrganizationMember | null;
}

type FormValues = UserInviteInput;

export function UserFormDialog({ open, onOpenChange, member }: UserFormDialogProps) {
  const isEdit = !!member;
  const inviteMutation = useInviteUser();
  const updateMutation = useUpdateUser(member?.id ?? '');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(userInviteSchema),
    defaultValues: { email: '', role: 'STAFF', notes: '' },
  });

  useEffect(() => {
    if (!open) return;
    reset(
      member
        ? { email: member.email, role: member.role, notes: member.notes ?? '' }
        : { email: '', role: 'STAFF', notes: '' }
    );
  }, [open, member, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEdit && member) {
        await updateMutation.mutateAsync({
          role: values.role,
          notes: values.notes ?? null,
        });
        toast.success(`Updated ${member.email}`);
      } else {
        await inviteMutation.mutateAsync({
          email: values.email,
          role: values.role,
          notes: values.notes ?? null,
        });
        toast.success(`Invited ${values.email}`);
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
            <DialogTitle>{isEdit ? 'Edit member' : 'Invite member'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Update the member\'s role and notes. Email cannot be changed.'
                : 'Add an email to your organization. They\'ll join automatically on their first Google sign-in.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="user@company.com"
                autoComplete="off"
                disabled={isEdit}
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="user-role">Role</Label>
              <Select id="user-role" {...register('role')}>
                <option value="STAFF">Staff</option>
                <option value="SITE_MANAGER">Site Manager</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </Select>
              {errors.role && (
                <p className="text-sm text-destructive">{errors.role.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="user-notes">Notes (optional)</Label>
              <Input id="user-notes" placeholder="Internal notes…" {...register('notes')} />
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
              {isSubmitting
                ? 'Saving…'
                : isEdit
                  ? 'Save changes'
                  : 'Send invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
