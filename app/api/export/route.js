import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiErrorHandling, requireAuthResponse } from '@/lib/api-response';
import { resolveExportScope } from '@/lib/export/resolveExportScope';
import { formatExport } from '@/lib/export/formatExport';

const VALID_TYPES = new Set(['list', 'sublist', 'space']);
const VALID_FORMATS = new Set(['csv', 'json']);

/**
 * GET /api/export?type=list|sublist|space&id=...&format=csv|json
 * Exports every task under the given scope as a CSV or JSON file download.
 */
export const GET = withApiErrorHandling(async function GET(request) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const type = request.nextUrl.searchParams.get('type');
    const id = request.nextUrl.searchParams.get('id');
    const format = request.nextUrl.searchParams.get('format');

    if (!VALID_TYPES.has(type) || !id || !VALID_FORMATS.has(format)) {
        return NextResponse.json({ error: 'Invalid export request' }, { status: 400 });
    }

    const supabase = await createClient();
    const scope = await resolveExportScope(supabase, { type, id });

    if (!scope) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { body, contentType, filename } = formatExport(scope, format);

    return new NextResponse(body, {
        headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    });
});
