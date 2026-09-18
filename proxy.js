import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/proxy';

// Redirects an already-logged-in visitor away (there's never a reason to re-login/signup).
const REDIRECT_IF_AUTHENTICATED_ROUTES = ['/login', '/signup'];

// Accessible without a session, not redirected away once authenticated -- a reset may legitimately happen mid-session.
const PUBLIC_ROUTES = [
    ...REDIRECT_IF_AUTHENTICATED_ROUTES,
    '/forgot-password',
    '/reset-password',
    '/auth/confirm',
];

/**
 * Gates every page route behind a session check and refreshes the Supabase session cookie
 * on each request. Optimistic only (cookie presence, not per-row authorization) - Next 16's
 * own docs are explicit that Server Actions bypass Proxy entirely, so real authorization
 * still has to happen in RLS policies and in each server action, not just here.
 *
 * @param {import('next/server').NextRequest} request
 * @returns {Promise<import('next/server').NextResponse>}
 */
export default async function proxy(request) {
    const { supabase, supabaseResponse } = createClient(request);

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;
    const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
    const isRedirectIfAuthenticatedRoute = REDIRECT_IF_AUTHENTICATED_ROUTES.some((route) =>
        pathname.startsWith(route),
    );

    if (!user && !isPublicRoute) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    if (user && isRedirectIfAuthenticatedRoute) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}

export const config = {
    // Skips static assets, the PWA manifest/icons/service worker, and /api (routes are not
    // yet auth-scoped - that lands in Bucket 2 - so redirecting them here would just break
    // existing anonymous fetches instead of protecting anything).
    matcher: [
        '/((?!_next/static|_next/image|api|favicon.ico|apple-icon.png|icon.png|manifest.webmanifest|icons|sw.js).*)',
    ],
};
