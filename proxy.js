import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/proxy';
import { decideProxyRoute } from '@/lib/auth/proxy-route';

const isDev = process.env.NODE_ENV === 'development';
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * Builds a per-request CSP - the theme-init script and Next's streamed scripts aren't static, so they need a nonce.
 *
 * @param {string} nonce - Fresh, single-request nonce.
 * @returns {string} Content-Security-Policy header value.
 */
function buildCspHeader(nonce) {
    const directives = [
        `default-src 'self'`,
        // 'unsafe-eval' is dev-only - React's dev-mode error-stack reconstruction needs it, prod doesn't use eval.
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${TURNSTILE_ORIGIN}${isDev ? " 'unsafe-eval'" : ''}`,
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' data:`,
        `font-src 'self'`,
        `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL}`,
        `frame-src ${TURNSTILE_ORIGIN}`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `form-action 'self'`,
        `frame-ancestors 'none'`,
        // Would force-upgrade dev's plain http://localhost and break it - prod is HTTPS-only already.
        ...(isDev ? [] : ['upgrade-insecure-requests']),
    ];
    return directives.join('; ');
}

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
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    const cspHeader = buildCspHeader(nonce);

    // Cloned - Next only forwards request headers to the render via NextResponse.next({ request: { headers } }).
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', cspHeader);

    const { supabase, getSupabaseResponse } = createClient(request, requestHeaders);

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
        redirectResponse.headers.set('Content-Security-Policy', cspHeader);
        return redirectResponse;
    }

    const response = getSupabaseResponse();
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
}

export const config = {
    // Skips static assets, the PWA manifest/icons/service worker, and /api (routes are not
    // yet auth-scoped - that lands in Bucket 2 - so redirecting them here would just break
    // existing anonymous fetches instead of protecting anything).
    matcher: [
        '/((?!_next/static|_next/image|api|favicon.ico|apple-icon.png|icon.png|manifest.webmanifest|icons|sw.js).*)',
    ],
};
