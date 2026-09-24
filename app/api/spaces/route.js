import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createSpace } from '@/actions/space-actions';
import { withApiErrorHandling, actionResponse, requireAuthResponse } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth/session';
import { attachMyPermissionLevel } from '@/lib/permissions/space-permissions';

/**
 * GET /api/spaces
 * Returns all spaces ordered by position, each with the caller's my_permission_level attached.
 */
export const GET = withApiErrorHandling(async function GET() {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const supabase = await createClient();
    const user = await getCurrentUser();

    const { data: spaces, error } = await supabase
        .from('spaces')
        .select('*')
        .order('position', { ascending: true });

    if (error) {
        return NextResponse.json({ error: 'Failed to fetch spaces' }, { status: 500 });
    }

    const spacesWithPermission = await attachMyPermissionLevel(supabase, spaces || [], user?.id ?? null);
    return NextResponse.json(spacesWithPermission);
});

/**
 * POST /api/spaces
 * Creates a new space. Appends it to the end of the space list.
 */
export const POST = withApiErrorHandling(async function POST(request) {
    const body = await request.json();
    return actionResponse(await createSpace(body), 201);
});
