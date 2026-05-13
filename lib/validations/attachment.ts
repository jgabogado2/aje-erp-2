import { z } from 'zod';
import {
  ATTACHMENT_ALLOWED_MIME_TYPES,
  ATTACHMENT_MAX_SIZE_BYTES,
} from '@/lib/api/storage';

// Step 1: client asks server for a presigned upload URL.
export const attachmentSignSchema = z.object({
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(ATTACHMENT_ALLOWED_MIME_TYPES),
  file_size: z
    .number()
    .int()
    .min(1)
    .max(
      ATTACHMENT_MAX_SIZE_BYTES,
      `File must be ${Math.round(ATTACHMENT_MAX_SIZE_BYTES / 1024 / 1024)} MB or smaller`
    ),
});

// Step 3: after client uploads to Supabase Storage, register the row.
export const attachmentRegisterSchema = z.object({
  storage_path: z.string().min(1),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(ATTACHMENT_ALLOWED_MIME_TYPES),
  file_size: z.number().int().min(1).max(ATTACHMENT_MAX_SIZE_BYTES),
});

export type AttachmentSignInput = z.infer<typeof attachmentSignSchema>;
export type AttachmentRegisterInput = z.infer<typeof attachmentRegisterSchema>;
