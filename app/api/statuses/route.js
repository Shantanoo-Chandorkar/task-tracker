import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import {
    withApiErrorHandling,
    requireAuthResponse,
    apiErrorResponse,
    queryFailedResponse,
} from '@/lib/api-response';
import { STATUSES_SPACE_ID_REQUIRED, STATUSES_LOAD_FAILED } from '@/lib/error-codes';

/**
 * GET /api/statuses?space_id=<id>
 * Returns the statuses for one space, ordered by position. space_id is required -
 * statuses only ever make sense scoped to one space.
 */
export const GET = withApiErrorHandling(async function GET(request) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const spaceId = request.nextUrl.searchParams.get('space_id');
    if (!spaceId) {
        return apiErrorResponse('space_id is required', STATUSES_SPACE_ID_REQUIRED, 400);
    }

    const supabase = await createClient();

    const { data: statuses, error } = await supabase
        .from('statuses')
        .select('*')
        .eq('space_id', spaceId)
        .order('position', { ascending: true });

    if (error) {
        return queryFailedResponse(
            '[api/statuses]',
            error,
            'Failed to fetch statuses',
            STATUSES_LOAD_FAILED,
        );
    }

    return NextResponse.json(statuses || []);
});
