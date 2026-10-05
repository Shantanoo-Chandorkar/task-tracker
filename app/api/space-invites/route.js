import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import {
    withApiErrorHandling,
    requireAuthResponse,
    apiErrorResponse,
    queryFailedResponse,
} from '@/lib/api-response';
import { INVITES_SPACE_ID_REQUIRED, INVITES_LOAD_FAILED } from '@/lib/error-codes';

/**
 * GET /api/space-invites?space_id=<id>
 * Returns pending space_invites rows for one space. RLS scopes visibility to the space's own
 * owner -- no extra ownership check needed here, a non-owner just gets an empty array.
 */
export const GET = withApiErrorHandling(async function GET(request) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const spaceId = request.nextUrl.searchParams.get('space_id');
    if (!spaceId) {
        return apiErrorResponse('space_id is required', INVITES_SPACE_ID_REQUIRED, 400);
    }

    const supabase = await createClient();

    const { data: invites, error } = await supabase
        .from('space_invites')
        .select('*')
        .eq('space_id', spaceId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) {
        return queryFailedResponse(
            '[api/space-invites]',
            error,
            'Failed to fetch invites',
            INVITES_LOAD_FAILED,
        );
    }

    return NextResponse.json(invites || []);
});
