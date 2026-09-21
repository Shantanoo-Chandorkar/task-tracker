import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { withApiErrorHandling, requireAuthResponse } from '@/lib/api-response';

/**
 * GET /api/profile - current user's display name and email, cached client-side by useCurrentUserProfileQuery.
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

    return NextResponse.json({
        display_name: profile?.display_name || user.user_metadata?.display_name || null,
        email: user.email,
    });
});
