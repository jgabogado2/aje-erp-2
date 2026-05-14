import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  handleUnknownError,
} from '@/lib/api/response';
import { z } from 'zod';

const prefsUpdateSchema = z.object({
  channels: z.record(z.string(), z.enum(['email', 'in_app', 'off'])).optional(),
  digest: z.enum(['immediate', 'daily', 'off']).optional(),
});

const DEFAULT_CHANNELS = {
  overdue: 'email',
  upcoming: 'email',
  assigned: 'in_app',
  status_changed: 'off',
};

export async function GET() {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', caller.userId)
      .maybeSingle();

    // Auto-create on first read.
    if (!data) {
      const { data: created, error } = await supabase
        .from('notification_preferences')
        .insert({ user_id: caller.userId, channels: DEFAULT_CHANNELS, digest: 'daily' })
        .select()
        .single();
      if (error) throw error;
      return apiSuccess(created);
    }

    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const body = await req.json();
    const input = prefsUpdateSchema.parse(body);

    const supabase = getSupabaseAdmin();

    // Upsert so the row is created if it doesn't exist yet.
    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: caller.userId,
        ...input,
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
