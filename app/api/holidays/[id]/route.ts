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
import { checkRateLimit } from '@/lib/api/rate-limit';
import { holidayUpdateSchema } from '@/lib/validations/holiday';
import { recordAudit } from '@/lib/api/audit';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const limited = await checkRateLimit(req, 'write', caller.userId);
    if (limited) return limited;

    const body = await req.json();
    const input = holidayUpdateSchema.parse(body);

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('holidays')
      .select('*')
      .eq('id', id)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();
    if (!existing) return apiNotFound('Holiday not found');

    const { data, error } = await supabase
      .from('holidays')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    await recordAudit(supabase, caller, {
      entity_type: 'holiday',
      entity_id: id,
      action: 'update',
      old_value: existing,
      new_value: data,
    });

    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('holidays')
      .select('*')
      .eq('id', id)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();
    if (!existing) return apiNotFound('Holiday not found');

    const { error } = await supabase.from('holidays').delete().eq('id', id);
    if (error) throw error;

    await recordAudit(supabase, caller, {
      entity_type: 'holiday',
      entity_id: id,
      action: 'delete',
      old_value: existing,
    });

    return apiSuccess({ id });
  } catch (err) {
    return handleUnknownError(err);
  }
}
