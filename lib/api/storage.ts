// Attachment storage constants + path helpers.
//
// MIME allowlist is intentionally narrow — matches typical compliance
// evidence: PDFs, images of receipts, spreadsheets, Word docs, plain CSV.
// Expanding the list later is a one-line change.

export const ATTACHMENTS_BUCKET = 'tracker-attachments';

export const ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ATTACHMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // legacy .xls
  'text/csv',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
] as const;

export type AttachmentAllowedMime =
  (typeof ATTACHMENT_ALLOWED_MIME_TYPES)[number];

export function isAllowedMime(mime: string): mime is AttachmentAllowedMime {
  return (ATTACHMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Build the canonical storage path for an attachment. Embedding the UUID
 * inside the filename guarantees uniqueness even if two uploads have the
 * same display name.
 */
export function buildAttachmentPath(args: {
  organizationId: string;
  siteId: string;
  taskEntryId: string;
  uuid: string;
  fileName: string;
}): string {
  const safeName = sanitizeFileName(args.fileName);
  return `${args.organizationId}/${args.siteId}/${args.taskEntryId}/${args.uuid}-${safeName}`;
}

// Replace path-unsafe characters but keep the original name recognizable.
// Storage objects with raw spaces / unicode still work via signed URLs, but
// keeping the path ASCII-clean avoids edge cases with copy-paste.
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
}

export const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 5; // 5 minutes
export const ATTACHMENT_UPLOAD_URL_TTL_SECONDS = 60 * 5; // 5 minutes
