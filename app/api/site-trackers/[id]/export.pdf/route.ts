import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getApiCaller } from '@/lib/api/auth';
import {
  apiForbidden,
  apiNotFound,
  apiUnauthorized,
  handleUnknownError,
} from '@/lib/api/response';
import {
  authorizeTrackerReport,
  getTrackerReportData,
  parseTrackerReportQuery,
} from '@/lib/api/tracker-report-data';
import { buildTrackerPdf } from '@/lib/reports/tracker-pdf';
import { safeFilePart, timestampForFilename } from '@/lib/reports/format';
import { toResponseBody } from '@/lib/reports/response';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const caller = await getApiCaller();
    if (!caller) return apiUnauthorized();

    const supabase = getSupabaseAdmin();
    const auth = await authorizeTrackerReport(supabase, caller, id);
    if (!auth.ok) {
      return auth.reason === 'not_found' ? apiNotFound('Site tracker not found') : apiForbidden();
    }

    const query = parseTrackerReportQuery(req.nextUrl.searchParams);
    const data = await getTrackerReportData(supabase, id, query);
    if (!data) return apiNotFound('Site tracker not found');

    const buffer = await buildTrackerPdf(data, caller.email);
    const filename = `${safeFilePart(data.site_tracker.site.code)}-${safeFilePart(
      data.site_tracker.tracker_category.name
    )}-${data.site_tracker.year}-${timestampForFilename()}.pdf`;

    return new Response(toResponseBody(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleUnknownError(err);
  }
}
