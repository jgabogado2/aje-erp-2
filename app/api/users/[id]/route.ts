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
import { userUpdateSchema } from '@/lib/validations/user';

type RouteContext = { params: Promise<{ id: string }> };

// `id` is the organization_members row id (the membership), not users.id.
// That's how admin/users is keyed today and how invites work before a user
// has ever signed in.

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        *,
        user:users(id, name, email, image, "emailVerified")
      `)
      .eq('id', id)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return apiNotFound('Member not found');
    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const body = await req.json();
    const input = userUpdateSchema.parse(body);

    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('organization_members')
      .select('id, user_id, email')
      .eq('id', id)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    if (!existing) return apiNotFound('Member not found');

    // Guard against self-lockout: can't deactivate yourself or demote yourself.
    const isSelf =
      existing.user_id === caller.userId ||
      existing.email?.toLowerCase() === caller.email.toLowerCase();
    if (isSelf && (input.is_active === false || input.role)) {
      return apiForbidden('You cannot change your own role or active status');
    }

    const { data, error } = await supabase
      .from('organization_members')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}
