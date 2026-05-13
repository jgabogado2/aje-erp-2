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
import { userInviteSchema } from '@/lib/validations/user';
import { recordAudit } from '@/lib/api/audit';

export async function GET() {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const supabase = getSupabaseAdmin();
    const { data: members, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        user_id,
        email,
        organization_id,
        role,
        is_active,
        notes,
        created_at,
        updated_at,
        user:users(id, name, image, "emailVerified")
      `)
      .eq('organization_id', caller.organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!members || members.length === 0) return apiSuccess([]);

    // Fold in user_sites count. Single grouped query keeps it O(1) extra trips.
    const userIds = members.map((m) => m.user_id).filter((id): id is string => !!id);
    const countsByUser = new Map<string, number>();
    if (userIds.length > 0) {
      const { data: rows } = await supabase
        .from('user_sites')
        .select('user_id')
        .in('user_id', userIds);
      for (const row of rows ?? []) {
        const uid = row.user_id as string;
        countsByUser.set(uid, (countsByUser.get(uid) ?? 0) + 1);
      }
    }

    const enriched = members.map((m) => ({
      ...m,
      sites_count: m.user_id ? countsByUser.get(m.user_id) ?? 0 : 0,
    }));

    return apiSuccess(enriched);
  } catch (err) {
    return handleUnknownError(err);
  }
}

// "Invite" = add an organization_members row. The users row is created
// automatically on their first Google sign-in by lib/auth.config.ts.
export async function POST(req: NextRequest) {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    if (caller.systemRole !== 'SUPER_ADMIN') return apiForbidden();

    const body = await req.json();
    const input = userInviteSchema.parse(body);

    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('organization_members')
      .select('id')
      .ilike('email', input.email)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    if (existing) {
      return apiConflict('This email is already a member of your organization');
    }

    const { data, error } = await supabase
      .from('organization_members')
      .insert({
        user_id: null,
        email: input.email,
        organization_id: caller.organizationId,
        role: input.role,
        notes: input.notes ?? null,
        invited_by: caller.organizationMemberId,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    await recordAudit(supabase, caller, {
      entity_type: 'user',
      entity_id: data.id as string,
      action: 'create',
      new_value: data,
    });

    return apiSuccess(data, 201);
  } catch (err) {
    return handleUnknownError(err);
  }
}
