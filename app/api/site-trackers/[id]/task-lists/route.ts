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
import {
  canReadAtSite,
  canWriteAtSite,
  siteIdForSiteTracker,
} from '@/lib/api/hierarchy-auth';
import { taskListCreateSchema } from '@/lib/validations/task-list';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteTrackerId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForSiteTracker(supabase, siteTrackerId);
    if (!siteId) return apiNotFound('Site tracker not found');
    if (!(await canReadAtSite(caller, siteId)).ok) return apiForbidden();

    const { data, error } = await supabase
      .from('task_lists')
      .select('*')
      .eq('site_tracker_id', siteTrackerId)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return apiSuccess(data ?? []);
  } catch (err) {
    return handleUnknownError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteTrackerId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForSiteTracker(supabase, siteTrackerId);
    if (!siteId) return apiNotFound('Site tracker not found');
    if (!(await canWriteAtSite(caller, siteId)).ok) return apiForbidden();

    const body = await req.json();
    const input = taskListCreateSchema.parse(body);

    // Optional section must belong to the same site_tracker — prevents
    // assigning a task list to a section from another tracker.
    if (input.tracker_section_id) {
      const { data: section } = await supabase
        .from('tracker_sections')
        .select('id')
        .eq('id', input.tracker_section_id)
        .eq('site_tracker_id', siteTrackerId)
        .maybeSingle();
      if (!section) return apiNotFound('Section not found in this tracker');
    }

    let displayOrder = input.display_order ?? 0;
    if (input.display_order === undefined) {
      const { data: last } = await supabase
        .from('task_lists')
        .select('display_order')
        .eq('site_tracker_id', siteTrackerId)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      displayOrder = (last?.display_order ?? -1) + 1;
    }

    const { data, error } = await supabase
      .from('task_lists')
      .insert({
        site_tracker_id: siteTrackerId,
        tracker_section_id: input.tracker_section_id ?? null,
        name: input.name,
        display_order: displayOrder,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return apiConflict(`A task list named "${input.name}" already exists`);
      }
      throw error;
    }
    return apiSuccess(data, 201);
  } catch (err) {
    return handleUnknownError(err);
  }
}
