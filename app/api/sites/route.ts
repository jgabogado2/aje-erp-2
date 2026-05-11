import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller, listCallerSiteIds } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiConflict,
  handleUnknownError,
} from '@/lib/api/response';
import { siteCreateSchema } from '@/lib/validations/site';

export async function GET() {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const allowedSiteIds = await listCallerSiteIds(caller);

    let query = supabase
      .from('sites')
      .select('id, organization_id, code, name, address, is_active, created_at, updated_at')
      .eq('organization_id', caller.organizationId)
      .order('code', { ascending: true });

    // Non-super-admins only see their assigned sites.
    if (allowedSiteIds !== null) {
      if (allowedSiteIds.length === 0) return apiSuccess([]);
      query = query.in('id', allowedSiteIds);
    }

    const { data, error } = await query;
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
    const input = siteCreateSchema.parse(body);

    const supabase = getSupabaseAdmin();

    // Enforce per-org unique code at the app layer too for a friendlier error.
    const { data: existing } = await supabase
      .from('sites')
      .select('id')
      .eq('organization_id', caller.organizationId)
      .ilike('code', input.code)
      .limit(1)
      .maybeSingle();

    if (existing) return apiConflict(`A site with code "${input.code}" already exists`);

    const { data, error } = await supabase
      .from('sites')
      .insert({
        organization_id: caller.organizationId,
        code: input.code,
        name: input.name,
        address: input.address ?? null,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return apiSuccess(data, 201);
  } catch (err) {
    return handleUnknownError(err);
  }
}
