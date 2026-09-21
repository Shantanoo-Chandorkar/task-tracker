import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/proxy';
import { decideProxyRoute } from '@/lib/auth/proxy-route';

/**
 * Gates every page route behind a session check and refreshes the Supabase session cookie
 * on each request. Optimistic only (cookie presence, not per-row authorization) - Next 16's
 * own docs are explicit that Server Actions bypass Proxy entirely, so real authorization
 * still has to happen in RLS policies and in each server action, not just here.
 * The routing rules themselves live in `decideProxyRoute`, which also ends expired guest sessions.
 *
 * @param {import('next/server').NextRequest} request
 * @returns {Promise<import('next/server').NextResponse>}
 */
export default async function proxy(request) {
    const { supabase, getSupabaseResponse } = createClient(request);

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const routeDecision = decideProxyRoute({ user, pathname: request.nextUrl.pathname });

    // Runs before the response is read, so the cleared cookies are on it
    if (routeDecision.clearsSession) await supabase.auth.signOut();

    if (routeDecision.action === 'redirect') {
        const url = request.nextUrl.clone();
        url.pathname = routeDecision.pathname;
        url.search = routeDecision.search;

        // A fresh redirect does not carry the session cookie changes, so copy them over
        const redirectResponse = NextResponse.redirect(url);
        getSupabaseResponse()
            .cookies.getAll()
            .forEach((sessionCookie) => redirectResponse.cookies.set(sessionCookie));
        return redirectResponse;
    }

    return getSupabaseResponse();
}

export const config = {
    // Skips static assets, the PWA manifest/icons/service worker, and /api (routes are not
    // yet auth-scoped - that lands in Bucket 2 - so redirecting them here would just break
    // existing anonymous fetches instead of protecting anything).
    matcher: [
        '/((?!_next/static|_next/image|api|favicon.ico|apple-icon.png|icon.png|manifest.webmanifest|icons|sw.js).*)',
    ],
};
