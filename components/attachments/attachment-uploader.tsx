'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useUploadAttachment } from '@/hooks/use-attachments';
import {
  ATTACHMENT_ALLOWED_MIME_TYPES,
  ATTACHMENT_MAX_SIZE_BYTES,
  isAllowedMime,
} from '@/lib/api/storage';

const ACCEPT_ATTR = ATTACHMENT_ALLOWED_MIME_TYPES.join(',');
const MAX_MB = Math.round(ATTACHMENT_MAX_SIZE_BYTES / 1024 / 1024);

export function AttachmentUploader({ taskEntryId }: { taskEntryId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAttachment(taskEntryId);
  const [progressName, setProgressName] = useState<string | null>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;

    if (!isAllowedMime(file.type)) {
      toast.error(`Unsupported file type (${file.type || 'unknown'})`);
      return;
    }
    if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
      toast.error(`File is too large. Max ${MAX_MB} MB.`);
      return;
    }

    setProgressName(file.name);
    try {
      await upload.mutateAsync(file);
      toast.success(`Uploaded "${file.name}"`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setProgressName(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={handlePick}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
      >
        <Upload className="mr-1 h-3.5 w-3.5" />
        {upload.isPending && progressName
          ? `Uploading ${progressName}…`
          : 'Upload file'}
      </Button>
      <span className="text-xs text-muted-foreground">
        Max {MAX_MB} MB · PDF, image, Excel, CSV, Word
      </span>
    </div>
  );
}
