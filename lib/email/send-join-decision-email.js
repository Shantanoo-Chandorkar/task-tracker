import { sendEmail, escapeHtml } from '@/lib/email/send-email';

/**
 * Notifies a requester that the space owner approved or rejected their join request.
 *
 * @param {string} requesterEmail
 * @param {string} spaceName
 * @param {boolean} wasApproved
 * @returns {Promise<void>}
 */
export async function sendJoinDecisionEmail(requesterEmail, spaceName, wasApproved) {
    const spacesLink = `${process.env.SITE_URL}/spaces`;
    const outcome = wasApproved ? 'approved' : 'declined';
    await sendEmail({
        toEmail: requesterEmail,
        subject: `Your request to join "${spaceName}" was ${outcome}`,
        text: `Your request to join "${spaceName}" was ${outcome}.${wasApproved ? ` Open it here: ${spacesLink}` : ''}`,
        html: `<p>Your request to join "${escapeHtml(spaceName)}" was <strong>${outcome}</strong>.</p>${wasApproved ? `<p><a href="${spacesLink}">Open the space</a></p>` : ''}`,
    });
}
