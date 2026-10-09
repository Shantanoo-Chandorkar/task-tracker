import { pluralize } from '@/lib/ui/pluralize';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Words how long until an invite expires. Display only: the server decides whether an expired invite can be used.
 *
 * @param {string} expiresAt - ISO timestamp
 * @param {number} [now] - Current time in milliseconds, for tests
 * @returns {string} e.g. "Expires in 3 days" or "Expired"
 */
export function formatInviteExpiry(expiresAt, now = Date.now()) {
    const daysLeft = Math.ceil((Date.parse(expiresAt) - now) / DAY_MS);
    if (daysLeft <= 0) return 'Expired';
    return `Expires in ${pluralize(daysLeft, 'day')}`;
}
