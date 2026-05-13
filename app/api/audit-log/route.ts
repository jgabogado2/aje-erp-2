import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller, listCallerSiteIds } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  handleUnknownError,
} from '@/lib/api/response';
import { auditLogQuerySchema } from '@/lib/validations/audit';

export async function GET(req: NextRequest) {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();
    // STAFF doesn't see the audit log. SUPER_ADMIN sees the whole org;
    // SITE_MANAGER sees their assigned sites.
    if (caller.systemRole === 'STAFF') return apiForbidden();

    const supabase = getSupabaseAdmin();

    const sp = req.nextUrl.searchParams;
    const query = auditLogQuerySchema.parse({
      site_id: sp.get('site_id') ?? undefined,
      entity_type: sp.get('entity_type') ?? undefined,
      entity_id: sp.get('entity_id') ?? undefined,
      user_id: sp.get('user_id') ?? undefined,
      action: sp.get('action') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      cursor: sp.get('cursor') ?? undefined,
      limit: sp.get('limit') ?? undefined,
    });

    // Build the scope of visible site_ids.
    // - SUPER_ADMIN: every site in their org (plus rows with site_id=null
    //   which are global-to-the-org events like inviting a user).
    // - SITE_MANAGER: only their user_sites entries, plus null-site rows
    //   *for entities they manage* — we keep it conservative and exclude
    //   null-site rows for SITE_MANAGERs to avoid leaking, e.g., user
    //   invitations across sites.
    let q = supabase
      .from('audit_log')
      .select(`
        *,
        actor:users!audit_log_user_id_fkey(id, name, email, image),
        site:sites!audit_log_site_id_fkey(id, code, name)
      `)
      .eq('organization_id', caller.organizationId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(query.limit + 1);

    if (caller.systemRole === 'SITE_MANAGER') {
      const allowedSites = (await listCallerSiteIds(caller)) ?? [];
      if (allowedSites.length === 0) return apiSuccess({ rows: [], next_cursor: null });
      q = q.in('site_id', allowedSites);
    }

    // Optional filters.
    if (query.site_id) {
      // Site managers can only filter to a site they have access to —
      // they're already constrained by the in() above so this is a refine.
      q = q.eq('site_id', query.site_id);
    }
    if (query.entity_type) q = q.eq('entity_type', query.entity_type);
    if (query.entity_id) q = q.eq('entity_id', query.entity_id);
    if (query.user_id) q = q.eq('user_id', query.user_id);
    if (query.action) q = q.eq('action', query.action);
    if (query.from) q = q.gte('created_at', query.from);
    if (query.to) q = q.lte('created_at', query.to);

    if (query.cursor) {
      const [cursorTs, cursorId] = query.cursor.split('|');
      if (cursorTs && cursorId) {
        // Composite cursor: rows strictly older than (cursorTs, cursorId).
        // Postgres' tuple comparison via raw filter would be cleaner; here
        // we approximate with a created_at < cursorTs OR (= AND id < cursorId).
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
    const next_cursor =
      hasMore && last ? `${last.created_at}|${last.id}` : null;

    return apiSuccess({ rows: pageRows, next_cursor });
  } catch (err) {
    return handleUnknownError(err);
  }
}
