import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { blockGuestAction } from '@/lib/guest/guest-guards';
import { NOT_AUTHENTICATED } from '@/lib/error-codes';

/**
 * Wraps a server action's auth check, try/catch, and error logging so callers only write the differing part.
 *
 * @param {string} logLabel - Identifies the action in a thrown-error log line, e.g. '[lists] create'.
 * @param {string} unexpectedError - User-facing message returned when the handler throws.
 * @param {(user: import('@supabase/supabase-js').User, supabase: object, ...args: any[]) => Promise<object>} handler - Action body, called with the resolved user and a Supabase client.
 * @param {object} [options]
 * @param {boolean} [options.blockGuest] - Also refuse a guest user, right after the auth check.
 * @param {boolean} [options.hasData] - Whether the action's return shape carries a `data` key.
 * @returns {(...args: any[]) => Promise<object>} The wrapped action, same call signature as the handler minus user/supabase.
 */
export function withAuthenticatedAction(
    logLabel,
    unexpectedError,
    handler,
    { blockGuest = false, hasData = true } = {},
) {
    return async (...args) => {
        const user = await getCurrentUser();
        if (!user) {
            return hasData
                ? { data: null, error: 'You must be logged in', code: NOT_AUTHENTICATED }
                : { error: 'You must be logged in', code: NOT_AUTHENTICATED };
        }

        if (blockGuest) {
            const guestBlock = blockGuestAction(user);
            if (guestBlock) return hasData ? { data: null, ...guestBlock } : guestBlock;
        }

        try {
            const supabase = await createClient();
            return await handler(user, supabase, ...args);
        } catch (thrown) {
            const ids = args.filter((arg) => typeof arg === 'string');
            console.error(`${logLabel} threw`, {
                ...(ids.length > 0 && { ids }),
                detail: thrown?.message,
            });
            return hasData ? { data: null, error: unexpectedError } : { error: unexpectedError };
        }
    };
}
