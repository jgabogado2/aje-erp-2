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
import { canWriteAtSite, siteIdForTask } from '@/lib/api/hierarchy-auth';
import { regenerateFutureEntriesForTask } from '@/lib/api/task-entry-generation';
import { todayInManila } from '@/lib/task-engine';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: taskId } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const siteId = await siteIdForTask(supabase, taskId);
    if (!siteId) return apiNotFound('Task not found');
    if (!(await canWriteAtSite(caller, siteId)).ok) return apiForbidden();

    const from = req.nextUrl.searchParams.get('from') ?? todayInManila();
    const result = await regenerateFutureEntriesForTask(supabase, taskId, from);

    return apiSuccess(result);
  } catch (err) {
    return handleUnknownError(err);
  }
}
