import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { withApiErrorHandling, requireAuthResponse } from '@/lib/api-response';
import { getCurrentUserProfile } from '@/lib/profile';

/**
 * GET /api/profile - current user's display name and email, cached client-side by useCurrentUserProfileQuery.
 * A guest also gets `is_guest` and the seconds left in its session, and has no display name or email.
 */
export const GET = withApiErrorHandling(async function GET() {
    const unauthorizedResponse = await requireAuthResponse();
    if (unauthorizedResponse) return unauthorizedResponse;

    const user = await getCurrentUser();
    const supabase = await createClient();

    return NextResponse.json(await getCurrentUserProfile(supabase, user));
});
