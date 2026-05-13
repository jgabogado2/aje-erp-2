import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import { apiForbidden, apiUnauthorized, handleUnknownError } from '@/lib/api/response';
import { dashboardSummaryQuerySchema } from '@/lib/validations/dashboard';
import { getDashboardReportData } from '@/lib/api/dashboard-report-data';
import { buildDashboardPdf } from '@/lib/reports/dashboard-pdf';
import { timestampForFilename } from '@/lib/reports/format';
import { toResponseBody } from '@/lib/reports/response';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const year = new Date().getFullYear();
    const query = dashboardSummaryQuerySchema.parse({
      site_id: req.nextUrl.searchParams.get('site_id') ?? undefined,
      year: req.nextUrl.searchParams.get('year') ?? year,
    });

    const { data, forbidden } = await getDashboardReportData(
      getSupabaseAdmin(),
      caller,
      query
    );
    if (forbidden) return apiForbidden();

    const buffer = await buildDashboardPdf(data, query.year ?? year, caller.email);
    return new Response(toResponseBody(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="dashboard-summary-${query.year ?? year}-${timestampForFilename()}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleUnknownError(err);
  }
}
