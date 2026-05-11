import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  TrackerSection,
  TaskList,
  Task,
  TaskWithAssignee,
  SiteTracker,
  TrackerCategory,
} from '@/types/domain';
import type {
  SectionCreateInput,
  SectionUpdateInput,
  SectionReorderInput,
} from '@/lib/validations/section';
import type {
  TaskListCreateInput,
  TaskListUpdateInput,
  TaskListReorderInput,
} from '@/lib/validations/task-list';
import type {
  TaskCreateInput,
  TaskUpdateInput,
  TaskReorderInput,
} from '@/lib/validations/task';

// The detail page consumes the hierarchy endpoint and folds it client-side.
// All mutations invalidate this single query key so the UI re-renders once.

export interface HierarchyPayload {
  site_tracker: SiteTracker & {
    tracker_category: TrackerCategory;
    site: { id: string; code: string; name: string; organization_id: string };
  };
  sections: TrackerSection[];
  task_lists: TaskList[];
  tasks: TaskWithAssignee[];
}

const hierarchyKey = (siteTrackerId: string) =>
  ['site-trackers', siteTrackerId, 'hierarchy'] as const;

export function useHierarchy(siteTrackerId: string | undefined) {
  return useQuery({
    queryKey: hierarchyKey(siteTrackerId ?? ''),
    queryFn: () =>
      apiClient.get<HierarchyPayload>(`/api/site-trackers/${siteTrackerId}/hierarchy`),
    enabled: !!siteTrackerId,
  });
}

// Sections ----------------------------------------------------------------

export function useCreateSection(siteTrackerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SectionCreateInput) =>
      apiClient.post<TrackerSection>(
        `/api/site-trackers/${siteTrackerId}/sections`,
        input
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: hierarchyKey(siteTrackerId) }),
  });
}

export function useUpdateSection(siteTrackerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SectionUpdateInput }) =>
      apiClient.patch<TrackerSection>(`/api/sections/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: hierarchyKey(siteTrackerId) }),
  });
}

export function useDeleteSection(siteTrackerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<TrackerSection>(`/api/sections/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: hierarchyKey(siteTrackerId) }),
  });
}

export function useReorderSections(siteTrackerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SectionReorderInput) =>
      apiClient.patch<{ updated: number }>(
        `/api/site-trackers/${siteTrackerId}/sections/reorder`,
        input
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: hierarchyKey(siteTrackerId) }),
  });
}

// Task lists --------------------------------------------------------------

export function useCreateTaskList(siteTrackerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskListCreateInput) =>
      apiClient.post<TaskList>(`/api/site-trackers/${siteTrackerId}/task-lists`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: hierarchyKey(siteTrackerId) }),
  });
}

export function useUpdateTaskList(siteTrackerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaskListUpdateInput }) =>
      apiClient.patch<TaskList>(`/api/task-lists/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: hierarchyKey(siteTrackerId) }),
  });
}

export function useDeleteTaskList(siteTrackerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<TaskList>(`/api/task-lists/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: hierarchyKey(siteTrackerId) }),
  });
}

export function useReorderTaskLists(siteTrackerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskListReorderInput) =>
      apiClient.patch<{ updated: number }>(
        `/api/site-trackers/${siteTrackerId}/task-lists/reorder`,
        input
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: hierarchyKey(siteTrackerId) }),
  });
}

// Tasks -------------------------------------------------------------------

export function useCreateTask(siteTrackerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskListId, input }: { taskListId: string; input: TaskCreateInput }) =>
      apiClient.post<Task>(`/api/task-lists/${taskListId}/tasks`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: hierarchyKey(siteTrackerId) }),
  });
}

export function useUpdateTask(siteTrackerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaskUpdateInput }) =>
      apiClient.patch<Task>(`/api/tasks/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: hierarchyKey(siteTrackerId) }),
  });
}

export function useDeleteTask(siteTrackerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<Task>(`/api/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: hierarchyKey(siteTrackerId) }),
  });
}

export function useReorderTasks(siteTrackerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskListId, input }: { taskListId: string; input: TaskReorderInput }) =>
      apiClient.patch<{ updated: number }>(
        `/api/task-lists/${taskListId}/tasks/reorder`,
        input
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: hierarchyKey(siteTrackerId) }),
  });
}
