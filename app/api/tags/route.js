import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import {
    withApiErrorHandling,
    requireAuthResponse,
    apiErrorResponse,
    queryFailedResponse,
} from '@/lib/api-response';
import { TAG_SPACE_ID_REQUIRED, TAGS_LOAD_FAILED } from '@/lib/error-codes';

/**
 * GET /api/tags?space_id=<id>
 * Returns every tag of one space in its saved order, for the tag picker and the tag settings.
 * space_id is required - tags only ever make sense scoped to one space.
 */
export const GET = withApiErrorHandling(async function GET(request) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const spaceId = request.nextUrl.searchParams.get('space_id');
    if (!spaceId) {
        return apiErrorResponse('space_id is required', TAG_SPACE_ID_REQUIRED, 400);
    }

    const supabase = await createClient();

    const { data: tags, error } = await supabase
        .from('tags')
        .select('id, name, color, position')
        .eq('space_id', spaceId)
        .order('position', { ascending: true })
        .order('name', { ascending: true });

    if (error) {
        return queryFailedResponse('[api/tags]', error, 'Failed to fetch tags', TAGS_LOAD_FAILED);
    }

    return NextResponse.json(tags || []);
});
