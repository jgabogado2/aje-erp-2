import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import { hasSiteAccess } from '@/lib/rbac';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiConflict,
  handleUnknownError,
} from '@/lib/api/response';
import { siteTrackerAssignSchema } from '@/lib/validations/tracker';
import { recordAudit } from '@/lib/api/audit';
import { generateEntriesForTaskListInDb } from '@/lib/api/task-entry-generation';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const access = await hasSiteAccess(caller.userId, siteId);
    if (!access) return apiForbidden();

    const supabase = getSupabaseAdmin();

    // Allow ?year=2026 to scope; default to current year.
    const yearParam = req.nextUrl.searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    const { data, error } = await supabase
      .from('site_trackers')
      .select(`
        id, site_id, tracker_category_id, year, is_active, created_at, updated_at,
        tracker_category:tracker_categories!inner(id, name, description, frequency, organization_id)
      `)
      .eq('site_id', siteId)
      .eq('year', year)
      .eq('tracker_category.organization_id', caller.organizationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return apiSuccess(data ?? []);
  } catch (err) {
    return handleUnknownError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: siteId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const body = await req.json();
    const input = siteTrackerAssignSchema.parse(body);

    const supabase = getSupabaseAdmin();

    // Site must be in caller's org.
    const { data: site } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    if (!site) return apiNotFound('Site not found in your organization');

    // Category must be in caller's org too.
    const { data: category } = await supabase
      .from('tracker_categories')
      .select('id, is_active')
      .eq('id', input.tracker_category_id)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    if (!category) return apiNotFound('Tracker category not found');
    if (!category.is_active) {
      return apiConflict('Cannot assign an inactive tracker category');
    }

    // Idempotency: unique (site, category, year). Surface a clearer error
    // than the raw 23505 from Postgres.
    const { data: existing } = await supabase
      .from('site_trackers')
      .select('id')
      .eq('site_id', siteId)
      .eq('tracker_category_id', input.tracker_category_id)
      .eq('year', input.year)
      .maybeSingle();

    if (existing) {
      return apiConflict(
        `This tracker is already assigned to the site for ${input.year}`
      );
    }

    // Single transaction: insert the site_tracker AND seed sections + task
    // lists from the category's JSONB templates. See migration 004.
    const { data: newId, error: rpcError } = await supabase.rpc(
      'assign_tracker_to_site',
      {
        p_site_id: siteId,
        p_category_id: input.tracker_category_id,
        p_year: input.year,
      }
    );

    if (rpcError) {
      // Most likely: the category has duplicate task-list names within the
      // same section. The DB unique constraint will catch it during seed
      // and the RPC rolls back the whole transaction. Translate to a 409
      // with a useful pointer for the user.
      const code = (rpcError as { code?: string }).code;
      const details = (rpcError as { details?: string }).details ?? '';
      if (code === '23505') {
        if (details.includes('task_lists')) {
          return apiConflict(
            'This category has duplicate task list names within the same section. Edit the category and rename one of them before assigning.'
          );
        }
        if (details.includes('tracker_sections')) {
          return apiConflict(
            'This category has duplicate section names. Edit the category and rename one of them before assigning.'
          );
        }
        return apiConflict('A constraint prevented assigning this tracker. Check the category for duplicate names.');
      }
      throw rpcError;
    }

    // The RPC seeds task_lists from the category templates but does not
    // generate task_entries — that's owned by the engine in the API layer.
    // Without this, template-seeded task lists render with no periods.
    const { data: seededTaskLists, error: seededError } = await supabase
      .from('task_lists')
      .select('id')
      .eq('site_tracker_id', newId as string);
    if (seededError) throw seededError;

    for (const taskList of seededTaskLists ?? []) {
      await generateEntriesForTaskListInDb(supabase, taskList.id as string);
    }

    const { data, error } = await supabase
      .from('site_trackers')
      .select(`
        *,
        tracker_category:tracker_categories(id, name, description, frequency)
      `)
      .eq('id', newId as string)
      .single();

    if (error) throw error;

    await recordAudit(supabase, caller, {
      entity_type: 'site_tracker',
      entity_id: newId as string,
      action: 'create',
      new_value: data,
      site_id: siteId,
    });

    return apiSuccess(data, 201);
  } catch (err) {
    return handleUnknownError(err);
  }
}
