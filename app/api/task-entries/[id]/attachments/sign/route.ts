import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  handleUnknownError,
} from '@/lib/api/response';
import { canReadAtSite, siteIdForTaskEntry } from '@/lib/api/hierarchy-auth';
import { attachmentSignSchema } from '@/lib/validations/attachment';
import {
  ATTACHMENTS_BUCKET,
  ATTACHMENT_UPLOAD_URL_TTL_SECONDS,
  buildAttachmentPath,
} from '@/lib/api/storage';

type RouteContext = { params: Promise<{ id: string }> };

// Step 1 of the upload flow. The client posts file metadata; we validate
// size/MIME, generate a unique storage path, and return a presigned upload
// URL the client PUTs the file to. The DB row is registered in step 2
// (POST /api/task-entries/[id]/attachments).
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForTaskEntry(supabase, id);
    if (!siteId) return apiNotFound('Task entry not found');
    if (!(await canReadAtSite(caller, siteId)).ok) return apiForbidden();

    const body = await req.json();
    const input = attachmentSignSchema.parse(body);

    const storagePath = buildAttachmentPath({
      organizationId: caller.organizationId,
      siteId,
      taskEntryId: id,
      uuid: crypto.randomUUID(),
      fileName: input.file_name,
    });

    const { data, error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error) throw error;

    return apiSuccess({
      upload_url: data.signedUrl,
      storage_path: storagePath,
      expires_in: ATTACHMENT_UPLOAD_URL_TTL_SECONDS,
      token: data.token,
    });
  } catch (err) {
    return handleUnknownError(err);
  }
}
