import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { NOT_AUTHENTICATED } from '@/lib/error-codes';

/**
 * Guards a route handler that queries the database directly instead of through an
 * already-guarded `actions/*.js` function, so an anonymous request gets a clean 401.
 *
 * @returns {Promise<import('next/server').NextResponse|null>} A 401 response if unauthenticated, else null
 */
export async function requireAuthResponse() {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json(
            { error: 'You must be logged in', code: NOT_AUTHENTICATED },
            { status: 401 },
        );
    }
    return null;
}

/**
 * Wraps a route handler so an unexpected exception returns a generic 500 instead of leaking internals.
 *
 * @param {Function} handler - Async (request, context) => NextResponse
 * @returns {Function} Wrapped handler with the same signature
 */
export function withApiErrorHandling(handler) {
    return async function wrapped(...args) {
        try {
            return await handler(...args);
        } catch {
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }
    };
}

/**
 * Converts a server action's `{ data, error, code }` result into a NextResponse. `code` rides
 * along in the body when present; `NOT_AUTHENTICATED` maps to 401, every other error to 400.
 *
 * @param {{data?: object|null, error: string|null, code?: string|null}} actionResult - The action's return value
 * @param {number} [successStatus] - Status code to use when there's no error (default 200)
 * @returns {import('next/server').NextResponse}
 */
export function actionResponse(actionResult, successStatus = 200) {
    if (actionResult.error) {
        const status = actionResult.code === 'NOT_AUTHENTICATED' ? 401 : 400;
        const body = actionResult.code
            ? { error: actionResult.error, code: actionResult.code }
            : { error: actionResult.error };
        return NextResponse.json(body, { status });
    }
    const body =
        'data' in actionResult ? (actionResult.data ?? { success: true }) : { success: true };
    return NextResponse.json(body, { status: successStatus });
}
