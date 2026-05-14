import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  handleUnknownError,
} from '@/lib/api/response';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { holidayCreateSchema, holidayQuerySchema } from '@/lib/validations/holiday';
import { recordAudit } from '@/lib/api/audit';

export async function GET(req: NextRequest) {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const query = holidayQuerySchema.parse({
      year: req.nextUrl.searchParams.get('year') ?? undefined,
    });

    const supabase = getSupabaseAdmin();
    let q = supabase
      .from('holidays')
      .select('id, date, name, is_recurring, created_at')
      .eq('organization_id', caller.organizationId)
      .order('date', { ascending: true });

    if (query.year) {
      q = q.gte('date', `${query.year}-01-01`).lte('date', `${query.year}-12-31`);
    }

    const { data, error } = await q;
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

    const limited = await checkRateLimit(req, 'write', caller.userId);
    if (limited) return limited;

    const body = await req.json();
    const input = holidayCreateSchema.parse(body);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('holidays')
      .insert({ ...input, organization_id: caller.organizationId })
      .select()
      .single();
    if (error) throw error;

    await recordAudit(supabase, caller, {
      entity_type: 'holiday',
      entity_id: data.id,
      action: 'create',
      new_value: data,
    });

    return apiSuccess(data, 201);
  } catch (err) {
    return handleUnknownError(err);
  }
}
