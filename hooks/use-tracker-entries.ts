import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { TaskEntry, TrackerEntriesPayload } from '@/types/domain';
import type { TaskEntryUpdateInput } from '@/lib/validations/task-entry';
import type { TrackerEntriesQuery } from '@/lib/validations/tracker-view';

export const trackerEntriesKey = (
  siteTrackerId: string,
  filters?: TrackerEntriesQuery
) => ['site-trackers', siteTrackerId, 'entries', filters ?? {}] as const;

function toQueryString(filters?: TrackerEntriesQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useTrackerEntries(
  siteTrackerId: string | undefined,
  filters?: TrackerEntriesQuery
) {
  return useQuery({
    queryKey: trackerEntriesKey(siteTrackerId ?? '', filters),
    queryFn: () =>
      apiClient.get<TrackerEntriesPayload>(
        `/api/site-trackers/${siteTrackerId}/entries${toQueryString(filters)}`
      ),
    enabled: !!siteTrackerId,
  });
}

export function useUpdateTrackerEntry(
  siteTrackerId: string,
  filters?: TrackerEntriesQuery
) {
  const qc = useQueryClient();
  const key = trackerEntriesKey(siteTrackerId, filters);

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaskEntryUpdateInput }) =>
      apiClient.patch<TaskEntry>(`/api/task-entries/${id}`, input),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TrackerEntriesPayload>(key);
      if (previous) {
        qc.setQueryData<TrackerEntriesPayload>(key, {
          ...previous,
          entries: previous.entries.map((entry) =>
            entry.id === id ? { ...entry, ...input } : entry
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSuccess: (updated) => {
      qc.setQueryData<TrackerEntriesPayload>(key, (current) =>
        current
          ? {
              ...current,
              entries: current.entries.map((entry) =>
                entry.id === updated.id ? updated : entry
              ),
            }
          : current
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
