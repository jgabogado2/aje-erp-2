import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, handleUnknownError } from '@/lib/api/response';
import { notificationQuerySchema } from '@/lib/validations/notification';

export async function GET(req: NextRequest) {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const query = notificationQuerySchema.parse({
      cursor: req.nextUrl.searchParams.get('cursor') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
      unread_only: req.nextUrl.searchParams.get('unread_only') ?? undefined,
    });

    const supabase = getSupabaseAdmin();
    const unreadResult = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', caller.userId)
      .eq('organization_id', caller.organizationId)
      .is('read_at', null);
    if (unreadResult.error) throw unreadResult.error;

    let q = supabase
      .from('notifications')
      .select('*, site:sites!notifications_site_id_fkey(id, code, name)')
      .eq('user_id', caller.userId)
      .eq('organization_id', caller.organizationId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(query.limit + 1);

    if (query.unread_only) q = q.is('read_at', null);

    if (query.cursor) {
      const [cursorTs, cursorId] = query.cursor.split('|');
      if (cursorTs && cursorId) {
        q = q.or(
          `created_at.lt.${cursorTs},and(created_at.eq.${cursorTs},id.lt.${cursorId})`
        );
      }
    }

    const { data, error } = await q;
    if (error) throw error;

    const rows = data ?? [];
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return apiSuccess({
      rows: pageRows,
      unread_count: unreadResult.count ?? 0,
      next_cursor: hasMore && last ? `${last.created_at}|${last.id}` : null,
    });
  } catch (err) {
    return handleUnknownError(err);
  }
}
