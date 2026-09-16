import { NextResponse } from 'next/server';

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
 * Converts a server action's `{ data, error }` (or `{ error }`) result into a NextResponse.
 * Action errors always map to 400 — real failures throw instead and hit the 500 handler.
 *
 * @param {{data?: object|null, error: string|null}} actionResult - The action's return value
 * @param {number} [successStatus] - Status code to use when there's no error (default 200)
 * @returns {import('next/server').NextResponse}
 */
export function actionResponse(actionResult, successStatus = 200) {
    if (actionResult.error) {
        return NextResponse.json({ error: actionResult.error }, { status: 400 });
    }
    const body = 'data' in actionResult ? (actionResult.data ?? { success: true }) : { success: true };
    return NextResponse.json(body, { status: successStatus });
}
