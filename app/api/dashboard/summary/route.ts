import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  handleUnknownError,
} from '@/lib/api/response';
import { dashboardSummaryQuerySchema } from '@/lib/validations/dashboard';
import { getDashboardReportData } from '@/lib/api/dashboard-report-data';

export async function GET(req: NextRequest) {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const query = dashboardSummaryQuerySchema.parse({
      site_id: req.nextUrl.searchParams.get('site_id') ?? undefined,
      year: req.nextUrl.searchParams.get('year') ?? new Date().getFullYear(),
    });

    const { data, forbidden } = await getDashboardReportData(
      getSupabaseAdmin(),
      caller,
      query
    );
    if (forbidden) return apiForbidden();

    return apiSuccess(data);
  } catch (err) {
    return handleUnknownError(err);
  }
}
