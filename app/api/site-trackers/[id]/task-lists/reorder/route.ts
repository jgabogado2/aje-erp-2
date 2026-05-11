import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiError,
  handleUnknownError,
} from '@/lib/api/response';
import { canWriteAtSite, siteIdForSiteTracker } from '@/lib/api/hierarchy-auth';
import { taskListReorderSchema } from '@/lib/validations/task-list';

type RouteContext = { params: Promise<{ id: string }> };

// Reorder task lists across the whole tracker. The UI may also move a task
// list to a different section via PATCH /api/task-lists/[id] — this endpoint
// is just for the ordering pass.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteTrackerId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForSiteTracker(supabase, siteTrackerId);
    if (!siteId) return apiNotFound('Site tracker not found');
    if (!(await canWriteAtSite(caller, siteId)).ok) return apiForbidden();

    const body = await req.json();
    const { ordered_ids } = taskListReorderSchema.parse(body);

    const { data: existing } = await supabase
      .from('task_lists')
      .select('id')
      .eq('site_tracker_id', siteTrackerId);
    const ownedIds = new Set((existing ?? []).map((r) => r.id as string));

    if (
      ordered_ids.length !== ownedIds.size ||
      !ordered_ids.every((id) => ownedIds.has(id))
    ) {
      return apiError(
        'validation_error',
        'ordered_ids must include every task list in this tracker exactly once',
        422
      );
    }

    const results = await Promise.all(
      ordered_ids.map((id, idx) =>
        supabase
          .from('task_lists')
          .update({ display_order: idx })
          .eq('id', id)
          .eq('site_tracker_id', siteTrackerId)
      )
    );
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) throw firstErr;

    return apiSuccess({ updated: ordered_ids.length });
  } catch (err) {
    return handleUnknownError(err);
  }
}
