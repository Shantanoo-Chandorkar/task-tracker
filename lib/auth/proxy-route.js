import { isGuestSessionExpired, isGuestUser } from '@/lib/guest/guest-session';

// Redirects an already-logged-in visitor away (there's never a reason to re-login/signup).
const REDIRECT_IF_AUTHENTICATED_ROUTES = ['/login', '/signup'];

// Accessible without a session, not redirected away once authenticated -- a reset may legitimately happen mid-session.
const PUBLIC_ROUTES = [...REDIRECT_IF_AUTHENTICATED_ROUTES, '/forgot-password', '/reset-password', '/auth/confirm'];

/**
 * Decides what the proxy does with a page request. Pure, so every rule can be tested without Next.js.
 * An expired guest is handled as logged out, and its session is flagged for clearing.
 *
 * @param {object} args
 * @param {object|null} args.user - Supabase user from `getUser()`, or null when logged out.
 * @param {string} args.pathname - Requested path.
 * @param {number} [args.nowMs] - Current time in milliseconds; only tests pass this.
 * @returns {{ action: 'next'|'redirect', pathname: string|null, search: string, clearsSession: boolean }}
 *   `clearsSession` is true when an expired guest's cookies must be removed, whatever the action is.
 */
export function decideProxyRoute({ user, pathname, nowMs = Date.now() }) {
    const isExpiredGuest = isGuestSessionExpired(user, nowMs);
    const isLoggedIn = Boolean(user) && !isExpiredGuest;

    const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
    const isRedirectIfAuthenticatedRoute = REDIRECT_IF_AUTHENTICATED_ROUTES.some((route) => pathname.startsWith(route));

    if (!isLoggedIn && !isPublicRoute) {
        return {
            action: 'redirect',
            pathname: '/login',
            search: isExpiredGuest ? '?reason=guest-expired' : '',
            clearsSession: isExpiredGuest,
        };
    }

    // A live guest may open /login and /signup, since that is how a guest moves on to a real account
    if (isLoggedIn && !isGuestUser(user) && isRedirectIfAuthenticatedRoute) {
        return { action: 'redirect', pathname: '/', search: '', clearsSession: false };
    }

    return { action: 'next', pathname: null, search: '', clearsSession: isExpiredGuest };
}
