import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { withApiErrorHandling, requireAuthResponse, queryFailedResponse } from '@/lib/api-response';
import { HABITS_LOAD_FAILED } from '@/modules/habits/errors';

/**
 * GET /api/habits
 * Returns every habit of the caller, in saved order - personal (decision 6), no space_id to scope by.
 */
export const GET = withApiErrorHandling(async function GET() {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const supabase = await createClient();

    const { data: habits, error } = await supabase
        .from('habits')
        .select('*')
        .order('position', { ascending: true });

    if (error) {
        return queryFailedResponse(
            '[api/habits]',
            error,
            'Failed to fetch habits',
            HABITS_LOAD_FAILED,
        );
    }

    return NextResponse.json(habits || []);
});
