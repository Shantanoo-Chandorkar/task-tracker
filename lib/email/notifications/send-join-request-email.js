import { sendEmail, escapeHtml, escapeUrl } from '@/lib/email/engine';

/**
 * Notifies a space owner that someone requested to join; links to the app, never straight to an approve action.
 *
 * @param {string} ownerEmail - Space owner's address.
 * @param {string} spaceName - Name of the space the requester wants to join.
 * @param {string} requesterEmail - Address of the person asking to join.
 * @returns {Promise<void>}
 */
export async function sendJoinRequestEmail(ownerEmail, spaceName, requesterEmail) {
    const spacesLink = `${process.env.SITE_URL}/spaces`;
    await sendEmail({
        toEmail: ownerEmail,
        subject: `${requesterEmail} wants to join "${spaceName}"`,
        plainTextBody: `${requesterEmail} requested to join your space "${spaceName}". Review it here: ${spacesLink}`,
        htmlBody: `<p><strong>${escapeHtml(requesterEmail)}</strong> requested to join your space "${escapeHtml(spaceName)}".</p><p><a href="${escapeUrl(spacesLink)}">Review the request</a></p>`,
    });
}
