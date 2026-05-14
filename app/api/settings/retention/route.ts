import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  handleUnknownError,
} from '@/lib/api/response';
import { z } from 'zod';

const retentionUpdateSchema = z.object({
  audit_retention_days: z.number().int().min(1).nullable(),
});

export async function GET() {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('organization_settings')
      .select('audit_retention_days')
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    return apiSuccess(data ?? { audit_retention_days: null });
  } catch (err) {
    return handleUnknownError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const body = await req.json();
    const { audit_retention_days } = retentionUpdateSchema.parse(body);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('organization_settings')
      .upsert({
        organization_id: caller.organizationId,
        audit_retention_days,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}
