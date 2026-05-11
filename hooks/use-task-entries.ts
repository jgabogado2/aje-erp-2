import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { TaskEntry, TaskEntriesPayload } from '@/types/domain';
import type { TaskEntryUpdateInput } from '@/lib/validations/task-entry';

export const taskEntriesKey = (taskId: string, year?: number) =>
  ['tasks', taskId, 'entries', year ?? 'all'] as const;

export function useTaskEntries(taskId: string | undefined, year?: number) {
  return useQuery({
    queryKey: taskEntriesKey(taskId ?? '', year),
    queryFn: () =>
      apiClient.get<TaskEntriesPayload>(
        `/api/tasks/${taskId}/entries${year ? `?year=${year}` : ''}`
      ),
    enabled: !!taskId,
  });
}

export function useUpdateTaskEntry(taskId: string, year?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaskEntryUpdateInput }) =>
      apiClient.patch<TaskEntry>(`/api/task-entries/${id}`, input),
    onMutate: async ({ id, input }) => {
      const key = taskEntriesKey(taskId, year);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TaskEntriesPayload>(key);

      if (previous) {
        qc.setQueryData<TaskEntriesPayload>(key, {
          ...previous,
          entries: previous.entries.map((entry) =>
            entry.id === id ? { ...entry, ...input } : entry
          ),
        });
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(taskEntriesKey(taskId, year), context.previous);
      }
    },
    onSuccess: (updated) => {
      const key = taskEntriesKey(taskId, year);
      qc.setQueryData<TaskEntriesPayload>(key, (current) =>
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
    onSettled: () => qc.invalidateQueries({ queryKey: taskEntriesKey(taskId, year) }),
  });
}

export function useRegenerateTaskEntries(taskId: string, year?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (from?: string) =>
      apiClient.post<{ inserted: number }>(
        `/api/tasks/${taskId}/regenerate${from ? `?from=${from}` : ''}`
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskEntriesKey(taskId, year) }),
  });
}
