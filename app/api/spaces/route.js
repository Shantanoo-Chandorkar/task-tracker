import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { withApiErrorHandling, requireAuthResponse, queryFailedResponse } from '@/lib/api-response';
import { SPACES_LOAD_FAILED } from '@/lib/error-codes';
import { getCurrentUser } from '@/lib/auth/session';
import { attachMyPermissionLevel } from '@/lib/permissions/space-permissions';
import { attachOwnerDisplayName } from '@/lib/permissions/space-owner-identity';

/**
 * GET /api/spaces
 * Returns all spaces ordered by position, each with the caller's my_permission_level and owner_display_name attached.
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
        return queryFailedResponse(
            '[api/spaces]',
            error,
            'Failed to fetch spaces',
            SPACES_LOAD_FAILED,
        );
    }

    const spacesWithPermission = await attachOwnerDisplayName(
        await attachMyPermissionLevel(supabase, spaces || [], user?.id ?? null),
    );
    return NextResponse.json(spacesWithPermission);
});
