import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { withApiErrorHandling, requireAuthResponse } from '@/lib/api-response';

/**
 * GET /api/tags?space_id=<id>
 * Returns every reusable tag in one space, for tag-picker autocomplete. space_id is required -
 * tags only ever make sense scoped to one space.
 */
export const GET = withApiErrorHandling(async function GET(request) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const spaceId = request.nextUrl.searchParams.get('space_id');
    if (!spaceId) {
        return NextResponse.json({ error: 'space_id is required' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: tags, error } = await supabase
        .from('tags')
        .select('id, name')
        .eq('space_id', spaceId)
        .order('name', { ascending: true });

    if (error) {
        return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
    }

    return NextResponse.json(tags || []);
});
