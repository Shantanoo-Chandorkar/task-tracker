import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createSpace } from '@/actions/space-actions';
import { withApiErrorHandling, actionResponse } from '@/lib/api-response';

/**
 * GET /api/spaces
 * Returns all spaces ordered by position.
 */
export const GET = withApiErrorHandling(async function GET() {
    const supabase = await createClient();

    const { data: spaces, error } = await supabase
        .from('spaces')
        .select('*')
        .order('position', { ascending: true });

    if (error) {
        return NextResponse.json({ error: 'Failed to fetch spaces' }, { status: 500 });
    }

    return NextResponse.json(spaces || []);
});

/**
 * POST /api/spaces
 * Creates a new space. Appends it to the end of the space list.
 */
export const POST = withApiErrorHandling(async function POST(request) {
    const body = await request.json();
    return actionResponse(await createSpace(body), 201);
});
