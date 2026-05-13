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
import { canReadAtSite, canWriteAtSite } from '@/lib/api/hierarchy-auth';
import { ATTACHMENTS_BUCKET } from '@/lib/api/storage';
import { recordAudit } from '@/lib/api/audit';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();

    // Resolve the owning site so we can authz against it. Join through the
    // task_entry -> task_list -> site_tracker -> site chain.
    const { data: attachment } = await supabase
      .from('attachments')
      .select(`
        *,
        task_entry:task_entries!inner(
          id,
          task_list:task_lists!inner(
            site_tracker:site_trackers!inner(
              site_id
            )
          )
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (!attachment) return apiNotFound('Attachment not found');

    const siteId = (
      (attachment.task_entry as unknown as {
        task_list: { site_tracker: { site_id: string } };
      }).task_list.site_tracker.site_id
    );

    // Anyone with site write access can remove; uploader can also remove
    // their own. (Read access is not enough — deletion is a write op.)
    const writeAccess = await canWriteAtSite(caller, siteId);
    const isUploader = attachment.uploaded_by === caller.userId;
    if (!writeAccess.ok && !isUploader) {
      // Even if you didn't upload it, at least require read access so we
      // return the right error shape.
      const readAccess = await canReadAtSite(caller, siteId);
      if (!readAccess.ok) return apiForbidden();
      return apiForbidden('Only the uploader or a site manager can delete this');
    }

    // Delete storage object first, then the DB row. If storage delete fails
    // we don't touch the DB. If DB delete fails after storage, we have a
    // dangling object; document this but don't block.
    const { error: storageError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .remove([attachment.storage_path as string]);
    if (storageError) {
      console.error('[attachments] storage delete failed', storageError);
      // Continue anyway — orphan storage object is recoverable; an
      // un-deletable DB row would be worse for the user.
    }

    const { error } = await supabase.from('attachments').delete().eq('id', id);
    if (error) throw error;

    await recordAudit(supabase, caller, {
      entity_type: 'task_entry',
      entity_id: attachment.task_entry_id as string,
      action: 'update',
      old_value: {
        attachment_id: id,
        file_name: attachment.file_name,
      },
      new_value: { removed_attachment: id },
      site_id: siteId,
    });

    return apiSuccess({ id });
  } catch (err) {
    return handleUnknownError(err);
  }
}
