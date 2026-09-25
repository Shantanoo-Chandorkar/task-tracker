import { sendEmail, escapeHtml, escapeUrl } from '@/lib/email/engine';
import { INVITE_EXPIRY_DAYS } from '@/lib/invites/invite-config';

/**
 * Emails a direct space invite.
 * Clicking the link only submits a join request, same as the manual flow -- the copy must never imply instant access.
 *
 * @param {string} toEmail - Invited recipient's address.
 * @param {string} spaceName - Name of the space they're invited to.
 * @param {string} inviterEmail - Address of the space owner sending the invite.
 * @param {string} acceptUrl - Signed, expiring accept-invite link.
 * @returns {Promise<void>}
 */
export async function sendSpaceInviteEmail(toEmail, spaceName, inviterEmail, acceptUrl) {
    await sendEmail({
        toEmail,
        subject: `${inviterEmail} invited you to "${spaceName}" on Task Tracker`,
        plainTextBody: `${inviterEmail} invited you to collaborate on "${spaceName}" on Task Tracker.

Accept the invite: ${acceptUrl}

Clicking the link sends a request to join -- the space owner still needs to approve it before you get access. This link expires in ${INVITE_EXPIRY_DAYS} days and only works when you're signed in with this email address (${toEmail}). If you don't have an account yet, you can create one first and you'll land back here automatically.`,
        htmlBody: `<p><strong>${escapeHtml(inviterEmail)}</strong> invited you to collaborate on "${escapeHtml(spaceName)}" on Task Tracker.</p><p><a href="${escapeUrl(acceptUrl)}">Accept the invite</a></p><p>Clicking the link sends a request to join &mdash; the space owner still needs to approve it before you get access. This link expires in ${INVITE_EXPIRY_DAYS} days and only works when you're signed in with this email address (${escapeHtml(toEmail)}). If you don't have an account yet, you can create one first and you'll land back here automatically.</p>`,
    });
}
