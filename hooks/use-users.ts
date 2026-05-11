import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  OrganizationMember,
  OrganizationMemberWithStats,
  UserSiteAssignment,
  UserSite,
} from '@/types/domain';
import type { UserInviteInput, UserUpdateInput } from '@/lib/validations/user';
import type { SiteRole } from '@/lib/auth.types';

const usersKey = ['users'] as const;
const userSitesKey = (memberId: string) => ['users', memberId, 'sites'] as const;

export function useUsers() {
  return useQuery({
    queryKey: usersKey,
    queryFn: () => apiClient.get<OrganizationMemberWithStats[]>('/api/users'),
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserInviteInput) =>
      apiClient.post<OrganizationMember>('/api/users', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: usersKey });
    },
  });
}

export function useUpdateUser(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserUpdateInput) =>
      apiClient.patch<OrganizationMember>(`/api/users/${memberId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: usersKey });
    },
  });
}

export function useUserSites(memberId: string | undefined) {
  return useQuery({
    queryKey: userSitesKey(memberId ?? ''),
    queryFn: () => apiClient.get<UserSiteAssignment[]>(`/api/users/${memberId}/sites`),
    enabled: !!memberId,
  });
}

// Assignment writes go through the per-site endpoints — same source of
// truth as the site-detail UI uses.
export function useAssignSite(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { site_id: string; user_id: string; role: SiteRole }) =>
      apiClient.post<UserSite>(`/api/sites/${input.site_id}/users`, {
        user_id: input.user_id,
        role: input.role,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userSitesKey(memberId) });
      qc.invalidateQueries({ queryKey: usersKey });
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}

export function useUnassignSite(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { site_id: string; user_id: string }) =>
      apiClient.delete<UserSite>(`/api/sites/${input.site_id}/users/${input.user_id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userSitesKey(memberId) });
      qc.invalidateQueries({ queryKey: usersKey });
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}
