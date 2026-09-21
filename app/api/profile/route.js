import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { withApiErrorHandling, requireAuthResponse } from '@/lib/api-response';
import { getGuestSecondsLeft, isGuestUser } from '@/lib/guest/guest-session';

/**
 * GET /api/profile - current user's display name and email, cached client-side by useCurrentUserProfileQuery.
 * A guest also gets `is_guest` and the seconds left in its session, and has no display name or email.
 */
export const GET = withApiErrorHandling(async function GET() {
    const unauthorizedResponse = await requireAuthResponse();
    if (unauthorizedResponse) return unauthorizedResponse;

    const user = await getCurrentUser();
    const supabase = await createClient();

    const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();

    const isGuest = isGuestUser(user);

    return NextResponse.json({
        display_name: isGuest ? null : profile?.display_name || user.user_metadata?.display_name || null,
        email: user.email ?? null,
        is_guest: isGuest,
        guest_seconds_left: getGuestSecondsLeft(user),
    });
});
