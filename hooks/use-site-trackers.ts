import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { SiteTracker, SiteTrackerWithCategory } from '@/types/domain';
import type {
  SiteTrackerAssignInput,
  SiteTrackerUpdateInput,
} from '@/lib/validations/tracker';

const siteTrackersKey = (siteId: string, year: number) =>
  ['sites', siteId, 'trackers', year] as const;

export function useSiteTrackers(siteId: string | undefined, year: number) {
  return useQuery({
    queryKey: siteTrackersKey(siteId ?? '', year),
    queryFn: () =>
      apiClient.get<SiteTrackerWithCategory[]>(
        `/api/sites/${siteId}/trackers?year=${year}`
      ),
    enabled: !!siteId,
  });
}

export function useAssignSiteTracker(siteId: string, year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SiteTrackerAssignInput) =>
      apiClient.post<SiteTrackerWithCategory>(`/api/sites/${siteId}/trackers`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: siteTrackersKey(siteId, year) });
    },
  });
}

export function useUpdateSiteTracker(siteId: string, trackerId: string, year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SiteTrackerUpdateInput) =>
      apiClient.patch<SiteTracker>(`/api/sites/${siteId}/trackers/${trackerId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: siteTrackersKey(siteId, year) });
    },
  });
}

export function useUnassignSiteTracker(siteId: string, year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (trackerId: string) =>
      apiClient.delete<SiteTracker>(`/api/sites/${siteId}/trackers/${trackerId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: siteTrackersKey(siteId, year) });
    },
  });
}
