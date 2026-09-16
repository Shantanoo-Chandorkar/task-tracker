import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createStatus } from '@/actions/status-actions';
import { withApiErrorHandling, actionResponse } from '@/lib/api-response';

/**
 * GET /api/statuses
 * Returns all statuses ordered by position.
 */
export const GET = withApiErrorHandling(async function GET() {
    const supabase = await createClient();

    const { data: statuses, error } = await supabase
        .from('statuses')
        .select('*')
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
