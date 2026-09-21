import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { NOT_AUTHENTICATED } from '@/lib/error-codes';
import { AUTH_ERROR_CODES } from '@/lib/auth/error-codes';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

/**
 * GET /api/auth/session - refreshes auth cookies for pages that only call /api, which proxy.js skips.
 *
 * @returns {Promise<NextResponse>} 200 session alive, 401 session ended, 503 check failed; never user data.
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: userLookup, error: userLookupError } = await supabase.auth.getUser();

        if (userLookup?.user) {
            return NextResponse.json({ authenticated: true }, { headers: NO_STORE_HEADERS });
        }

        // A dropped connection to Supabase says nothing about the session, so it must not look like a logout
        if (userLookupError?.name === 'AuthRetryableFetchError' || userLookupError?.status >= 500) {
            return NextResponse.json(
                { authenticated: null, error: 'Could not check your session', code: AUTH_ERROR_CODES.SESSION_CHECK_UNAVAILABLE },
                { status: 503, headers: NO_STORE_HEADERS },
            );
        }

        return NextResponse.json(
            { authenticated: false, error: 'Your session has ended', code: NOT_AUTHENTICATED },
            { status: 401, headers: NO_STORE_HEADERS },
        );
    } catch {
        return NextResponse.json(
            { authenticated: null, error: 'Could not check your session', code: AUTH_ERROR_CODES.SESSION_CHECK_UNAVAILABLE },
            { status: 503, headers: NO_STORE_HEADERS },
        );
    }
}
