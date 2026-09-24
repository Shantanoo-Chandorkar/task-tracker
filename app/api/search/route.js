import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requireAuthResponse, withApiErrorHandling } from '@/lib/api-response';

const RESULTS_PER_CATEGORY = 8;

/**
 * Escapes Postgres ILIKE wildcard characters (and the escape character
 * itself) in user input, so a search term containing `%` or `_` matches
 * literally instead of acting as a wildcard.
 *
 * @param {string} value - Raw search term
 * @returns {string} Value safe to interpolate into an ILIKE pattern
 */
function escapeIlike(value) {
    return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * GET /api/search?q=
 * Searches task titles, list names, and space names. Returns up to 8
 * matches per category. An empty/whitespace query returns empty results
 * immediately rather than scanning every row.
 */
export const GET = withApiErrorHandling(async function GET(request) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const searchQuery = (request.nextUrl.searchParams.get('q') ?? '').trim();

    if (!searchQuery) {
        return NextResponse.json({ tasks: [], lists: [], spaces: [] });
    }

    const supabase = await createClient();
    const pattern = `%${escapeIlike(searchQuery)}%`;

    const [
        { data: tasks, error: tasksError },
        { data: lists, error: listsError },
        { data: spaces, error: spacesError },
    ] = await Promise.all([
        supabase
            .from('tasks')
            .select('id, title, list_id, lists(name)')
            .ilike('title', pattern)
            .limit(RESULTS_PER_CATEGORY),
        supabase
            .from('lists')
            .select('id, name, space_id')
            .ilike('name', pattern)
            .limit(RESULTS_PER_CATEGORY),
        supabase
            .from('spaces')
            .select('id, name')
            .ilike('name', pattern)
            .limit(RESULTS_PER_CATEGORY),
    ]);

    if (tasksError || listsError || spacesError) {
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    const normalizedTasks = (tasks || []).map((task) => ({
        id: task.id,
        title: task.title,
        list_id: task.list_id,
        list_name: task.lists?.name ?? null,
    }));

    return NextResponse.json({
        tasks: normalizedTasks,
        lists: lists || [],
        spaces: spaces || [],
    });
});
