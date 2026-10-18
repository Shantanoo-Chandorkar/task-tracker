import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import {
    withApiErrorHandling,
    requireAuthResponse,
    queryFailedResponse,
    apiErrorResponse,
} from '@/lib/api-response';
import { isValidLocalDateString } from '@/modules/habits/domain/local-date';
import { HABIT_ENTRIES_LOAD_FAILED, HABIT_ENTRY_DATE_INVALID } from '@/modules/habits/errors';

/**
 * GET /api/habit-entries?since=YYYY-MM-DD
 * Returns every check-in of the caller (RLS-scoped), optionally from a local date onward -
 * bounds the row count the Today view loads for streak computation.
 */
export const GET = withApiErrorHandling(async function GET(request) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const since = request.nextUrl.searchParams.get('since');
    if (since !== null && !isValidLocalDateString(since)) {
        return apiErrorResponse(
            'since must be a valid YYYY-MM-DD date',
            HABIT_ENTRY_DATE_INVALID,
            400,
        );
    }

    const supabase = await createClient();

    let query = supabase.from('habit_entries').select('*').order('local_date', { ascending: true });
    if (since) query = query.gte('local_date', since);
    const { data: entries, error } = await query;

    if (error) {
        return queryFailedResponse(
            '[api/habit-entries]',
            error,
            'Failed to fetch check-ins',
            HABIT_ENTRIES_LOAD_FAILED,
        );
    }

    return NextResponse.json(entries || []);
});
