import { sendEmail, escapeHtml, escapeUrl } from '@/lib/email/engine';

/**
 * Notifies a requester that the space owner approved or rejected their join request.
 *
 * @param {string} requesterEmail - Address of the person who asked to join.
 * @param {string} spaceName - Name of the space they asked to join.
 * @param {boolean} wasApproved - True if the owner approved the request.
 * @returns {Promise<void>}
 */
export async function sendJoinDecisionEmail(requesterEmail, spaceName, wasApproved) {
    const spacesLink = `${process.env.SITE_URL}/spaces`;
    const outcome = wasApproved ? 'approved' : 'declined';
    await sendEmail({
        toEmail: requesterEmail,
        subject: `Your request to join "${spaceName}" was ${outcome}`,
        plainTextBody: `Your request to join "${spaceName}" was ${outcome}.${wasApproved ? ` Open it here: ${spacesLink}` : ''}`,
        htmlBody: `<p>Your request to join "${escapeHtml(spaceName)}" was <strong>${outcome}</strong>.</p>${wasApproved ? `<p><a href="${escapeUrl(spacesLink)}">Open the space</a></p>` : ''}`,
    });
}
