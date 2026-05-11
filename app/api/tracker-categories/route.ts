import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiConflict,
  handleUnknownError,
} from '@/lib/api/response';
import { trackerCategoryCreateSchema } from '@/lib/validations/tracker';

export async function GET() {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('tracker_categories')
      .select('*')
      .eq('organization_id', caller.organizationId)
      .order('name', { ascending: true });

    if (error) throw error;
    return apiSuccess(data ?? []);
  } catch (err) {
    return handleUnknownError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const body = await req.json();
    const input = trackerCategoryCreateSchema.parse(body);

    const supabase = getSupabaseAdmin();

    // Friendly duplicate check (no unique constraint on name — orgs may
    // intentionally version a category, e.g. "Monthly FS (2025)").
    const { data: existing } = await supabase
      .from('tracker_categories')
      .select('id')
      .eq('organization_id', caller.organizationId)
      .ilike('name', input.name)
      .maybeSingle();

    if (existing) {
      return apiConflict(`A tracker category named "${input.name}" already exists`);
    }

    const { data, error } = await supabase
      .from('tracker_categories')
      .insert({
        organization_id: caller.organizationId,
        name: input.name,
        description: input.description ?? null,
        frequency: input.frequency,
        section_templates: input.section_templates,
        task_list_templates: input.task_list_templates,
        is_active: true,
        created_by: caller.userId,
      })
      .select()
      .single();

    if (error) throw error;
    return apiSuccess(data, 201);
  } catch (err) {
    return handleUnknownError(err);
  }
}
