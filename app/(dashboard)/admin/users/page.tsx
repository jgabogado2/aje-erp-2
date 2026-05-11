'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Pencil, Power, Building2, Search } from 'lucide-react';
import {
  PageContainer,
  PageSection,
  PageCard,
  PageEmptyState,
} from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { useUsers, useUpdateUser } from '@/hooks/use-users';
import { ApiError } from '@/lib/api-client';
import { UserFormDialog } from '@/components/admin/users/user-form-dialog';
import { AssignSitesDialog } from '@/components/admin/users/assign-sites-dialog';
import type { OrganizationMember, OrganizationMemberWithStats } from '@/types/domain';
import type { SystemRole } from '@/lib/auth.types';

const ROLE_LABEL: Record<SystemRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  SITE_MANAGER: 'Site Manager',
  STAFF: 'Staff',
};

function roleBadgeVariant(role: SystemRole): 'default' | 'secondary' | 'destructive' {
  if (role === 'SUPER_ADMIN') return 'destructive';
  if (role === 'SITE_MANAGER') return 'default';
  return 'secondary';
}

function getInitials(name?: string | null, email?: string | null) {
  if (name) {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return email?.slice(0, 2).toUpperCase() ?? 'U';
}

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizationMember | null>(null);
  const [assigning, setAssigning] = useState<OrganizationMember | null>(null);
  const [toggleTarget, setToggleTarget] = useState<OrganizationMember | null>(null);

  const usersQuery = useUsers();
  // Updater keyed by row id — needed for the toggle confirmation dialog.
  const toggleMutation = useUpdateUser(toggleTarget?.id ?? '');

  const filtered = useMemo<OrganizationMemberWithStats[]>(() => {
    const rows = usersQuery.data ?? [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (m) =>
        m.email.toLowerCase().includes(q) ||
        m.user?.name?.toLowerCase().includes(q) ||
        ROLE_LABEL[m.role].toLowerCase().includes(q)
    );
  }, [usersQuery.data, search]);

  if (status === 'loading') return null;
  if (!session?.userRole || session.userRole.role !== 'SUPER_ADMIN') {
    redirect('/unauthorized');
  }

  const isSelf = (m: OrganizationMember) =>
    m.user_id === session.user?.id ||
    m.email.toLowerCase() === session.user?.email?.toLowerCase();

  const handleConfirmToggle = async () => {
    if (!toggleTarget) return;
    try {
      await toggleMutation.mutateAsync({ is_active: !toggleTarget.is_active });
      toast.success(
        `${toggleTarget.email} ${toggleTarget.is_active ? 'deactivated' : 'reactivated'}`
      );
      setToggleTarget(null);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to update member status';
      toast.error(message);
    }
  };

  return (
    <PageContainer
      breadcrumbs={[{ label: 'Admin' }, { label: 'Users' }]}
      title="Users"
      description="Manage members of your organization, their role, and site access."
      actions={
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Invite member
        </Button>
      }
    >
      <PageSection>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <PageCard>
          {usersQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : usersQuery.isError ? (
            <div className="p-8 text-center text-sm text-destructive">
              Failed to load users.{' '}
              <Button variant="link" onClick={() => usersQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <PageEmptyState
              title={search ? 'No matches' : 'No members yet'}
              description={
                search
                  ? 'Try a different query.'
                  : 'Invite your first member to get started.'
              }
              action={
                !search ? (
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Invite member
                  </Button>
                ) : null
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sites</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[1%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {m.user?.image && (
                            <AvatarImage src={m.user.image} alt={m.user.name ?? m.email} />
                          )}
                          <AvatarFallback>
                            {getInitials(m.user?.name, m.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {m.user?.name ?? '—'}
                          </div>
                          <div className="truncate text-sm text-muted-foreground">
                            {m.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant(m.role)}>
                        {ROLE_LABEL[m.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.role === 'SUPER_ADMIN' ? (
                        <span className="italic">All sites</span>
                      ) : (
                        <span>
                          {m.sites_count} {m.sites_count === 1 ? 'site' : 'sites'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.is_active ? 'default' : 'secondary'}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {!m.user_id && (
                        <Badge variant="outline" className="ml-1">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAssigning(m)}
                          disabled={m.role === 'SUPER_ADMIN' || !m.user_id}
                          aria-label={`Assign sites for ${m.email}`}
                          title={
                            m.role === 'SUPER_ADMIN'
                              ? 'Super Admins implicitly access all sites'
                              : !m.user_id
                                ? 'User must sign in once before being assigned'
                                : 'Manage site assignments'
                          }
                        >
                          <Building2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(m);
                            setFormOpen(true);
                          }}
                          disabled={isSelf(m)}
                          aria-label={`Edit ${m.email}`}
                          title={isSelf(m) ? 'You cannot edit your own membership' : 'Edit'}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToggleTarget(m)}
                          disabled={isSelf(m)}
                          aria-label={
                            m.is_active ? `Deactivate ${m.email}` : `Reactivate ${m.email}`
                          }
                          title={
                            isSelf(m)
                              ? 'You cannot deactivate your own membership'
                              : m.is_active
                                ? 'Deactivate'
                                : 'Reactivate'
                          }
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PageCard>

        {!usersQuery.isLoading && filtered.length > 0 && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Total: {usersQuery.data?.length ?? 0}</span>
            <span>•</span>
            <span>
              Active: {usersQuery.data?.filter((u) => u.is_active).length ?? 0}
            </span>
            <span>•</span>
            <span>
              Super Admins:{' '}
              {usersQuery.data?.filter((u) => u.role === 'SUPER_ADMIN').length ?? 0}
            </span>
          </div>
        )}
      </PageSection>

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} member={editing} />
      <AssignSitesDialog
        open={!!assigning}
        onOpenChange={(open) => !open && setAssigning(null)}
        member={assigning}
      />

      <AlertDialog
        open={!!toggleTarget}
        onOpenChange={(open) => !open && setToggleTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.is_active ? 'Deactivate member?' : 'Reactivate member?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active
                ? `${toggleTarget?.email} will lose access immediately. Their site assignments and history are preserved — you can reactivate later.`
                : `${toggleTarget?.email} will regain access with their existing role and site assignments.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmToggle}
              disabled={toggleMutation.isPending}
            >
              {toggleMutation.isPending
                ? 'Working…'
                : toggleTarget?.is_active
                  ? 'Deactivate'
                  : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
