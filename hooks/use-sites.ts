import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Site, UserSite } from '@/types/domain';
import type { SiteCreateInput, SiteUpdateInput } from '@/lib/validations/site';
import type { UserSiteAssignInput } from '@/lib/validations/user';

const sitesKey = ['sites'] as const;
const siteUsersKey = (siteId: string) => ['sites', siteId, 'users'] as const;

export function useSites() {
  return useQuery({
    queryKey: sitesKey,
    queryFn: () => apiClient.get<Site[]>('/api/sites'),
  });
}

export function useSite(siteId: string | undefined) {
  return useQuery({
    queryKey: ['sites', siteId],
    queryFn: () => apiClient.get<Site>(`/api/sites/${siteId}`),
    enabled: !!siteId,
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SiteCreateInput) => apiClient.post<Site>('/api/sites', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sitesKey });
    },
  });
}

export function useUpdateSite(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SiteUpdateInput) => apiClient.patch<Site>(`/api/sites/${siteId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sitesKey });
      qc.invalidateQueries({ queryKey: ['sites', siteId] });
    },
  });
}

export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (siteId: string) => apiClient.delete<Site>(`/api/sites/${siteId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sitesKey });
    },
  });
}

export function useSiteUsers(siteId: string | undefined) {
  return useQuery({
    queryKey: siteUsersKey(siteId ?? ''),
    queryFn: () => apiClient.get<UserSite[]>(`/api/sites/${siteId}/users`),
    enabled: !!siteId,
  });
}

export function useAssignUserToSite(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserSiteAssignInput) =>
      apiClient.post<UserSite>(`/api/sites/${siteId}/users`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: siteUsersKey(siteId) });
    },
  });
}

export function useUnassignUserFromSite(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.delete<UserSite>(`/api/sites/${siteId}/users/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: siteUsersKey(siteId) });
    },
  });
}
