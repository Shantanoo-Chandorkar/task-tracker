import { GUEST_ERROR_CODES } from '@/lib/guest/guest-error-codes';
import { GUEST_LIMITS } from '@/lib/guest/guest-config';

const LIMIT_MARKER = 'GUEST_LIMIT_REACHED:';
const NOUN_BY_LIMITED_TABLE = {
    spaces: ['space', 'spaces'],
    lists: ['list', 'lists'],
    sublists: ['sublist', 'sublists'],
    tasks: ['task', 'tasks'],
    statuses: ['status', 'statuses'],
    tags: ['tag', 'tags'],
};

/**
 * Turns a guest-limit error raised by the database (migration 0015) into a friendly, stable result.
 * Accepts a Supabase error or a thrown Error, since `duplicateTask` wraps the database message in one.
 *
 * @param {{ message?: string }|null|undefined} databaseError - Error from an insert, or a thrown Error.
 * @returns {{ error: string, code: string }|null} The result to return to the caller, or null when this is not a
 *   guest-limit error and the caller should use its usual generic message.
 */
export function toGuestLimitResult(databaseError) {
    const message = databaseError?.message;
    if (typeof message !== 'string') return null;

    const markerIndex = message.indexOf(LIMIT_MARKER);
    if (markerIndex === -1) return null;

    const limitedTable = message.slice(markerIndex + LIMIT_MARKER.length).match(/^[a-z_]+/)?.[0];
    const nouns = NOUN_BY_LIMITED_TABLE[limitedTable];
    const limit = GUEST_LIMITS[limitedTable];

    const friendlyMessage = nouns
        ? `Guest mode is limited to ${limit} ${limit === 1 ? nouns[0] : nouns[1]}. Sign up to create more.`
        : 'That is over the guest mode limit. Sign up for a full account.';

    return { error: friendlyMessage, code: GUEST_ERROR_CODES.LIMIT_REACHED };
}
