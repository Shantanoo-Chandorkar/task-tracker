import { sendEmail, escapeHtml } from '@/lib/email/send-email';

/**
 * Notifies a space owner that someone requested to join. Never links straight to an approve
 * action -- approval must always be a deliberate, authenticated in-app step.
 *
 * @param {string} ownerEmail
 * @param {string} spaceName
 * @param {string} requesterEmail
 * @returns {Promise<void>}
 */
export async function sendJoinRequestEmail(ownerEmail, spaceName, requesterEmail) {
    const spacesLink = `${process.env.SITE_URL}/spaces`;
    await sendEmail({
        toEmail: ownerEmail,
        subject: `${requesterEmail} wants to join "${spaceName}"`,
        text: `${requesterEmail} requested to join your space "${spaceName}". Review it here: ${spacesLink}`,
        html: `<p><strong>${escapeHtml(requesterEmail)}</strong> requested to join your space "${escapeHtml(spaceName)}".</p><p><a href="${spacesLink}">Review the request</a></p>`,
    });
}
