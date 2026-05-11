import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { TrackerCategory } from '@/types/domain';
import type {
  TrackerCategoryCreateInput,
  TrackerCategoryUpdateInput,
} from '@/lib/validations/tracker';

const categoriesKey = ['tracker-categories'] as const;

export function useTrackerCategories() {
  return useQuery({
    queryKey: categoriesKey,
    queryFn: () => apiClient.get<TrackerCategory[]>('/api/tracker-categories'),
  });
}

export function useTrackerCategory(id: string | undefined) {
  return useQuery({
    queryKey: ['tracker-categories', id],
    queryFn: () => apiClient.get<TrackerCategory>(`/api/tracker-categories/${id}`),
    enabled: !!id,
  });
}

export function useCreateTrackerCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TrackerCategoryCreateInput) =>
      apiClient.post<TrackerCategory>('/api/tracker-categories', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoriesKey });
    },
  });
}

export function useUpdateTrackerCategory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TrackerCategoryUpdateInput) =>
      apiClient.patch<TrackerCategory>(`/api/tracker-categories/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoriesKey });
      qc.invalidateQueries({ queryKey: ['tracker-categories', id] });
    },
  });
}

export function useDeleteTrackerCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<TrackerCategory>(`/api/tracker-categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoriesKey });
    },
  });
}
