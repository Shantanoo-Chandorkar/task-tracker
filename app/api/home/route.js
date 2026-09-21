import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiErrorHandling, requireAuthResponse } from '@/lib/api-response';
import { HOME_LOAD_FAILED } from '@/lib/error-codes';
import { loadHomeSummary } from '@/lib/home/build-home-summary';

/**
 * GET /api/home - priority tasks, recent tasks, recent lists and recent sublists for the Home screen.
 *
 * @returns {Promise<NextResponse>} 200 with the summary, 401 when logged out, 500 with `HOME_LOAD_FAILED`.
 */
export const GET = withApiErrorHandling(async function GET() {
    const unauthorizedResponse = await requireAuthResponse();
    if (unauthorizedResponse) return unauthorizedResponse;

    const supabase = await createClient();
    const { data: homeSummary, error: homeLoadError } = await loadHomeSummary(supabase);

    if (homeLoadError) {
        return NextResponse.json({ error: homeLoadError, code: HOME_LOAD_FAILED }, { status: 500 });
    }

    return NextResponse.json(homeSummary);
});
