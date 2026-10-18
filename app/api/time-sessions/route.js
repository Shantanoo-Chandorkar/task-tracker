import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { withApiErrorHandling, requireAuthResponse, queryFailedResponse } from '@/lib/api-response';
import { TIME_SESSIONS_LOAD_FAILED } from '@/modules/timer/errors';

const LOOKBACK_DAYS = 30;

/**
 * GET /api/time-sessions
 * Returns the caller's own sessions (live and completed) from a fixed lookback window onward -
 * bounds the row count, same purpose as `/api/habit-entries`'s `since`, with no client-supplied
 * range yet since nothing in Bucket C2 needs one.
 */
export const GET = withApiErrorHandling(async function GET() {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const supabase = await createClient();
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: sessions, error } = await supabase
        .from('time_sessions')
        .select('*')
        .gte('started_at', since)
        .order('started_at', { ascending: false });

    if (error) {
        return queryFailedResponse(
            '[api/time-sessions]',
            error,
            'Failed to fetch time sessions',
            TIME_SESSIONS_LOAD_FAILED,
        );
    }

    return NextResponse.json(sessions || []);
});
