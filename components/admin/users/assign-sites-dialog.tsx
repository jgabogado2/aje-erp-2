'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { useSites } from '@/hooks/use-sites';
import { useUserSites, useAssignSite, useUnassignSite } from '@/hooks/use-users';
import type { OrganizationMember } from '@/types/domain';
import type { SiteRole } from '@/lib/auth.types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select } from '@/components/ui/select';

interface AssignSitesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: OrganizationMember | null;
}

export function AssignSitesDialog({ open, onOpenChange, member }: AssignSitesDialogProps) {
  const sitesQuery = useSites();
  const assignmentsQuery = useUserSites(member?.id);
  const assignMutation = useAssignSite(member?.id ?? '');
  const unassignMutation = useUnassignSite(member?.id ?? '');

  // Track per-site role choice for the *unassigned* rows. Defaults to STAFF
  // because that's the safer choice.
  const [pendingRoles, setPendingRoles] = useState<Record<string, SiteRole>>({});

  // Map of site_id -> current assignment for fast lookup.
  const assignmentBySiteId = useMemo(() => {
    const map = new Map<string, { id: string; role: SiteRole }>();
    for (const a of assignmentsQuery.data ?? []) {
      map.set(a.site_id, { id: a.id, role: a.role });
    }
    return map;
  }, [assignmentsQuery.data]);

  const handleAssign = async (siteId: string) => {
    if (!member?.user_id) {
      toast.error('User has not signed in yet — they need to log in once before being assigned');
      return;
    }
    const role = pendingRoles[siteId] ?? 'STAFF';
    try {
      await assignMutation.mutateAsync({ site_id: siteId, user_id: member.user_id, role });
      toast.success('Site assigned');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to assign site';
      toast.error(message);
    }
  };

  const handleUnassign = async (siteId: string) => {
    if (!member?.user_id) return;
    try {
      await unassignMutation.mutateAsync({ site_id: siteId, user_id: member.user_id });
      toast.success('Site unassigned');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to unassign site';
      toast.error(message);
    }
  };

  const sites = (sitesQuery.data ?? []).filter((s) => s.is_active);
  const pendingUserSignIn = !!member && !member.user_id;
  const isSuperAdmin = member?.role === 'SUPER_ADMIN';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign sites — {member?.email}</DialogTitle>
          <DialogDescription>
            {isSuperAdmin
              ? 'Super Admins implicitly have access to every site in your organization. Site-level assignments are not needed.'
              : pendingUserSignIn
                ? 'This user has not signed in yet. They will be assignable to sites after their first Google sign-in.'
                : 'Choose which sites this user can access and what role they have on each.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {sitesQuery.isLoading || assignmentsQuery.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : sites.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No active sites yet. Create one in Admin → Sites first.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-[1%] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((site) => {
                  const assignment = assignmentBySiteId.get(site.id);
                  const isAssigned = !!assignment;
                  const role = pendingRoles[site.id] ?? assignment?.role ?? 'STAFF';
                  const disabled =
                    isSuperAdmin ||
                    pendingUserSignIn ||
                    assignMutation.isPending ||
                    unassignMutation.isPending;

                  return (
                    <TableRow key={site.id}>
                      <TableCell>
                        <div className="font-medium">{site.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {site.code}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isAssigned ? (
                          <Badge variant="secondary">
                            {assignment.role === 'SITE_MANAGER' ? 'Site Manager' : 'Staff'}
                          </Badge>
                        ) : (
                          <Select
                            id={`role-${site.id}`}
                            value={role}
                            onChange={(e) =>
                              setPendingRoles((prev) => ({
                                ...prev,
                                [site.id]: e.target.value as SiteRole,
                              }))
                            }
                            disabled={disabled}
                          >
                            <option value="STAFF">Staff</option>
                            <option value="SITE_MANAGER">Site Manager</option>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isAssigned ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnassign(site.id)}
                            disabled={disabled}
                            aria-label={`Remove from ${site.name}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAssign(site.id)}
                            disabled={disabled}
                            aria-label={`Assign to ${site.name}`}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
