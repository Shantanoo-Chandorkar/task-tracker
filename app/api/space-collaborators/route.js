import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { withApiErrorHandling, requireAuthResponse } from '@/lib/api-response';

/**
 * Attaches each collaborator's display_name, resolved server-side via the admin client.
 * RLS blocks reading another user's profiles row directly - falls back to requester_email.
 *
 * @param {object[]} collaborators - space_collaborators rows, each with a user_id
 * @returns {Promise<object[]>} The same rows, each with a display_name added
 */
async function attachDisplayNames(collaborators) {
    if (collaborators.length === 0) return collaborators;

    const adminSupabase = createAdminClient();
    const { data: profiles } = await adminSupabase
        .from('profiles')
        .select('id, display_name')
        .in(
            'id',
            collaborators.map((collaborator) => collaborator.user_id),
        );

    const displayNameByUserId = new Map(
        (profiles || []).map((profile) => [profile.id, profile.display_name]),
    );

    return collaborators.map((collaborator) => ({
        ...collaborator,
        display_name: displayNameByUserId.get(collaborator.user_id) ?? null,
    }));
}

/**
 * GET /api/space-collaborators?space_id=<id>&status=<pending|accepted>
 * Returns space_collaborators rows for one space. RLS scopes visibility to the space's own
 * owner or the requesting user's own rows -- no extra ownership check needed here.
 */
export const GET = withApiErrorHandling(async function GET(request) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const spaceId = request.nextUrl.searchParams.get('space_id');
    const status = request.nextUrl.searchParams.get('status');
    if (!spaceId) {
        return NextResponse.json({ error: 'space_id is required' }, { status: 400 });
    }

    const supabase = await createClient();

    let query = supabase.from('space_collaborators').select('*').eq('space_id', spaceId);
    if (status) query = query.eq('status', status);

    const { data: collaborators, error } = await query.order('created_at', { ascending: true });

    if (error) {
        return NextResponse.json({ error: 'Failed to fetch collaborators' }, { status: 500 });
    }

    return NextResponse.json(await attachDisplayNames(collaborators || []));
});
