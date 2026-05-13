'use client';

import { format } from 'date-fns';
import { toast } from 'sonner';
import { Download, Trash2, FileText, Image as ImageIcon, FileSpreadsheet, File } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  useAttachments,
  useDeleteAttachment,
} from '@/hooks/use-attachments';
import type { AttachmentWithUrl } from '@/types/domain';

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <ImageIcon className="h-4 w-4" />;
  if (mime === 'application/pdf') return <FileText className="h-4 w-4" />;
  if (mime.includes('sheet') || mime === 'text/csv' || mime.includes('excel'))
    return <FileSpreadsheet className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface AttachmentListProps {
  taskEntryId: string;
  /** When true, hides the delete control even for the uploader. */
  readOnly?: boolean;
}

export function AttachmentList({ taskEntryId, readOnly }: AttachmentListProps) {
  const query = useAttachments(taskEntryId);
  const deleteMutation = useDeleteAttachment(taskEntryId);
  const items = query.data ?? [];

  if (query.isLoading) {
    return (
      <p className="text-xs text-muted-foreground">Loading attachments…</p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No attachments yet.</p>
    );
  }

  return (
    <ul className="grid gap-1.5">
      {items.map((att) => (
        <AttachmentRow
          key={att.id}
          attachment={att}
          readOnly={readOnly}
          onDelete={async () => {
            try {
              await deleteMutation.mutateAsync(att.id);
              toast.success('Attachment removed');
            } catch (err) {
              toast.error(
                err instanceof ApiError ? err.message : 'Failed to delete'
              );
            }
          }}
          isDeleting={deleteMutation.isPending}
        />
      ))}
    </ul>
  );
}

function AttachmentRow({
  attachment,
  readOnly,
  onDelete,
  isDeleting,
}: {
  attachment: AttachmentWithUrl;
  readOnly?: boolean;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{fileIcon(attachment.mime_type)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{attachment.file_name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {formatBytes(attachment.file_size)} ·{' '}
          {attachment.uploader?.name ??
            attachment.uploader?.email ??
            'Unknown user'}{' '}
          · {format(new Date(attachment.uploaded_at), 'MMM d, yyyy')}
        </div>
      </div>
      <Button asChild variant="ghost" size="sm" aria-label="Download attachment">
        <a href={attachment.signed_url} target="_blank" rel="noreferrer">
          <Download className="h-3.5 w-3.5" />
        </a>
      </Button>
      {!readOnly && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label="Delete attachment"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  );
}
