import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createStatus } from '@/actions/status-actions';
import { withApiErrorHandling, actionResponse, requireAuthResponse } from '@/lib/api-response';

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
        return NextResponse.json({ error: 'space_id is required' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: statuses, error } = await supabase
        .from('statuses')
        .select('*')
        .eq('space_id', spaceId)
        .order('position', { ascending: true });

    if (error) {
        return NextResponse.json({ error: 'Failed to fetch statuses' }, { status: 500 });
    }

    return NextResponse.json(statuses || []);
});

/**
 * POST /api/statuses
 * Creates a new status. Appends it to the end of the status list.
 */
export const POST = withApiErrorHandling(async function POST(request) {
    const body = await request.json();
    return actionResponse(await createStatus(body), 201);
});
