import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiClient } from '@/lib/api-client';
import type { AttachmentSignResponse, AttachmentWithUrl } from '@/types/domain';

const attachmentsKey = (entryId: string) =>
  ['task-entries', entryId, 'attachments'] as const;

export function useAttachments(taskEntryId: string | undefined) {
  return useQuery({
    queryKey: attachmentsKey(taskEntryId ?? ''),
    queryFn: () =>
      apiClient.get<AttachmentWithUrl[]>(
        `/api/task-entries/${taskEntryId}/attachments`
      ),
    enabled: !!taskEntryId,
  });
}

// Three-step upload: sign -> PUT to storage -> register row. We expose it as
// a single mutation so the UI stays simple. If the PUT fails the row is
// never registered, so retries are safe.
export function useUploadAttachment(taskEntryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      // 1. Ask server for an upload URL.
      const sign = await apiClient.post<AttachmentSignResponse>(
        `/api/task-entries/${taskEntryId}/attachments/sign`,
        {
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
        }
      );

      // 2. PUT the bytes to Supabase Storage directly. Bypasses our API so
      // big files don't go through the Node runtime.
      const putRes = await fetch(sign.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!putRes.ok) {
        throw new ApiError(
          `Upload failed (${putRes.status})`,
          'upload_failed',
          putRes.status
        );
      }

      // 3. Register the row.
      return apiClient.post<AttachmentWithUrl>(
        `/api/task-entries/${taskEntryId}/attachments`,
        {
          storage_path: sign.storage_path,
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
        }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attachmentsKey(taskEntryId) });
    },
  });
}

export function useDeleteAttachment(taskEntryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      apiClient.delete<{ id: string }>(`/api/attachments/${attachmentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attachmentsKey(taskEntryId) });
    },
  });
}
