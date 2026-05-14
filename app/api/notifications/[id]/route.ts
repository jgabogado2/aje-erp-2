import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiNotFound,
  apiSuccess,
  apiUnauthorized,
  handleUnknownError,
} from '@/lib/api/response';
import { markNotificationReadSchema } from '@/lib/validations/notification';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const { id } = await params;
    const input = markNotificationReadSchema.parse(await req.json());
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: input.read ? new Date().toISOString() : null })
      .eq('id', id)
      .eq('user_id', caller.userId)
      .eq('organization_id', caller.organizationId)
      .select('*, site:sites!notifications_site_id_fkey(id, code, name)')
      .maybeSingle();

    if (error) throw error;
    if (!data) return apiNotFound('Notification not found');

    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}
