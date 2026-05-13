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
import { sectionCreateSchema } from '@/lib/validations/section';
import { recordAudit } from '@/lib/api/audit';

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
      .from('tracker_sections')
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
    const input = sectionCreateSchema.parse(body);

    // Default display_order to "end of list".
    let displayOrder = input.display_order ?? 0;
    if (input.display_order === undefined) {
      const { data: last } = await supabase
        .from('tracker_sections')
        .select('display_order')
        .eq('site_tracker_id', siteTrackerId)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      displayOrder = (last?.display_order ?? -1) + 1;
    }

    const { data, error } = await supabase
      .from('tracker_sections')
      .insert({
        site_tracker_id: siteTrackerId,
        name: input.name,
        display_order: displayOrder,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return apiConflict(`A section named "${input.name}" already exists`);
      }
      throw error;
    }

    await recordAudit(supabase, caller, {
      entity_type: 'tracker_section',
      entity_id: data.id as string,
      action: 'create',
      new_value: data,
      site_id: siteId,
    });

    return apiSuccess(data, 201);
  } catch (err) {
    return handleUnknownError(err);
  }
}
