import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiConflict,
  handleUnknownError,
} from '@/lib/api/response';
import { canReadAtSite, siteIdForTaskEntry } from '@/lib/api/hierarchy-auth';
import { attachmentRegisterSchema } from '@/lib/validations/attachment';
import {
  ATTACHMENTS_BUCKET,
  ATTACHMENT_SIGNED_URL_TTL_SECONDS,
} from '@/lib/api/storage';
import { recordAudit } from '@/lib/api/audit';
import type { AttachmentWithUrl } from '@/types/domain';

type RouteContext = { params: Promise<{ id: string }> };

// List attachments for an entry. Each row gets a fresh short-lived signed
// download URL so the UI can render thumbnails/links without exposing the
// bucket publicly.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForTaskEntry(supabase, id);
    if (!siteId) return apiNotFound('Task entry not found');
    if (!(await canReadAtSite(caller, siteId)).ok) return apiForbidden();

    const { data, error } = await supabase
      .from('attachments')
      .select(`
        *,
        uploader:users!attachments_uploaded_by_fkey(id, name, email, image)
      `)
      .eq('task_entry_id', id)
      .order('uploaded_at', { ascending: false });
    if (error) throw error;

    const rows = data ?? [];
    if (rows.length === 0) return apiSuccess<AttachmentWithUrl[]>([]);

    // Mint signed URLs in a single batched call.
    const paths = rows.map((r) => r.storage_path as string);
    const { data: signed, error: signErr } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrls(paths, ATTACHMENT_SIGNED_URL_TTL_SECONDS);
    if (signErr) throw signErr;

    const urlByPath = new Map<string, string>();
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
    }

    const withUrls = rows.map((r) => ({
      ...(r as Record<string, unknown>),
      signed_url: urlByPath.get(r.storage_path as string) ?? '',
    })) as AttachmentWithUrl[];

    return apiSuccess(withUrls);
  } catch (err) {
    return handleUnknownError(err);
  }
}

// Step 2 of the upload flow: client has already PUT the file via the
// presigned URL from /sign. They now POST the metadata so we record the row.
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
    const input = attachmentRegisterSchema.parse(body);

    // Defense in depth: verify the storage_path is namespaced under the
    // expected organization/site/entry prefix. Stops a caller from
    // registering an arbitrary path they happen to know.
    const expectedPrefix = `${caller.organizationId}/${siteId}/${id}/`;
    if (!input.storage_path.startsWith(expectedPrefix)) {
      return apiForbidden('storage_path does not match this task entry');
    }

    // Verify the file actually landed in storage before recording.
    const head = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .list(expectedPrefix.replace(/\/$/, ''), {
        limit: 100,
        search: input.storage_path.slice(expectedPrefix.length),
      });
    if (head.error) throw head.error;
    const found = (head.data ?? []).some(
      (entry) => `${expectedPrefix}${entry.name}` === input.storage_path
    );
    if (!found) {
      return apiNotFound('Upload not found in storage. Did the PUT succeed?');
    }

    const { data, error } = await supabase
      .from('attachments')
      .insert({
        task_entry_id: id,
        storage_path: input.storage_path,
        file_name: input.file_name,
        file_size: input.file_size,
        mime_type: input.mime_type,
        uploaded_by: caller.userId,
      })
      .select(`
        *,
        uploader:users!attachments_uploaded_by_fkey(id, name, email, image)
      `)
      .single();

    if (error) {
      if (error.code === '23505') {
        return apiConflict('This file is already registered to this entry');
      }
      throw error;
    }

    await recordAudit(supabase, caller, {
      entity_type: 'task_entry',
      entity_id: id,
      action: 'update',
      old_value: { attachments_count: '<see new_value>' },
      new_value: {
        attachments_count: '+1',
        added_attachment: {
          id: data.id,
          file_name: data.file_name,
          file_size: data.file_size,
        },
      },
      site_id: siteId,
    });

    return apiSuccess(data, 201);
  } catch (err) {
    return handleUnknownError(err);
  }
}
