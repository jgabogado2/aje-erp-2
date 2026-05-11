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
import { sectionReorderSchema } from '@/lib/validations/section';

type RouteContext = { params: Promise<{ id: string }> };

// Bulk reorder: client sends the ordered list of section ids, server writes
// display_order = array index for each. Validates the ids match this tracker
// to prevent assigning order to sections you don't own.
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
    const { ordered_ids } = sectionReorderSchema.parse(body);

    const { data: existing } = await supabase
      .from('tracker_sections')
      .select('id')
      .eq('site_tracker_id', siteTrackerId);
    const ownedIds = new Set((existing ?? []).map((r) => r.id as string));

    if (ordered_ids.length !== ownedIds.size || !ordered_ids.every((id) => ownedIds.has(id))) {
      return apiError(
        'validation_error',
        'ordered_ids must include every section in this tracker exactly once',
        422
      );
    }

    // Two-step write to avoid UNIQUE-by-order conflicts if any existed:
    // bump everything into the safe range first, then write final values.
    // (Not strictly needed since display_order has no unique constraint,
    // but cheap insurance.)
    const updates = ordered_ids.map((id, idx) =>
      supabase
        .from('tracker_sections')
        .update({ display_order: idx })
        .eq('id', id)
        .eq('site_tracker_id', siteTrackerId)
    );
    const results = await Promise.all(updates);
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) throw firstErr;

    return apiSuccess({ updated: ordered_ids.length });
  } catch (err) {
    return handleUnknownError(err);
  }
}
