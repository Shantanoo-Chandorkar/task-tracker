import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { NOT_AUTHENTICATED, INTERNAL_ERROR } from '@/lib/error-codes';

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
 * Builds a failure response that always carries a stable machine-readable code beside the message.
 *
 * @param {string} message - Human-readable message, safe to show the user
 * @param {string} code - Stable code from lib/error-codes.js
 * @param {number} status - HTTP status code
 * @returns {import('next/server').NextResponse}
 */
export function apiErrorResponse(message, code, status) {
    return NextResponse.json({ error: message, code }, { status });
}

/**
 * Logs a failed database read and returns a 500 that hides the database detail from the caller.
 *
 * @param {string} logLabel - Route prefix for the log line, e.g. '[api/tasks]'
 * @param {{ code?: string, message?: string }|null} queryError - Supabase error; logged, never returned
 * @param {string} message - Human-readable message for the caller
 * @param {string} code - Stable code from lib/error-codes.js
 * @returns {import('next/server').NextResponse}
 */
export function queryFailedResponse(logLabel, queryError, message, code) {
    console.error(`${logLabel} query failed`, {
        code: queryError?.code,
        detail: queryError?.message,
    });
    return apiErrorResponse(message, code, 500);
}

/**
 * Wraps a route handler so an unexpected exception is logged and returns a generic 500, never internals.
 *
 * @param {Function} handler - Async (request, context) => NextResponse
 * @returns {Function} Wrapped handler with the same signature
 */
export function withApiErrorHandling(handler) {
    return async function wrapped(...args) {
        try {
            return await handler(...args);
        } catch (thrown) {
            const [request] = args;
            console.error('[api] unhandled error', {
                method: request?.method,
                path: request?.nextUrl?.pathname,
                detail: thrown?.message,
            });
            return apiErrorResponse('Internal server error', INTERNAL_ERROR, 500);
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
        const status = actionResult.code === NOT_AUTHENTICATED ? 401 : 400;
        const body = actionResult.code
            ? { error: actionResult.error, code: actionResult.code }
            : { error: actionResult.error };
        return NextResponse.json(body, { status });
    }
    const body =
        'data' in actionResult ? (actionResult.data ?? { success: true }) : { success: true };
    return NextResponse.json(body, { status: successStatus });
}
