import { sendEmail, escapeHtml, escapeUrl } from '@/lib/email/engine';

/**
 * Sends the new-account confirmation link through the same pipeline as every other auth email.
 *
 * @param {string} toEmail - Address of the new account.
 * @param {string} confirmLink - One-time signup confirmation URL.
 * @returns {Promise<void>}
 */
export async function sendSignupConfirmationEmail(toEmail, confirmLink) {
    await sendEmail({
        toEmail,
        subject: 'Confirm your Task Tracker account',
        plainTextBody: `Confirm your account to get started: ${confirmLink}\n\nIf you didn't sign up, ignore this email.`,
        htmlBody: `<p>Confirm your account to get started:</p><p><a href="${escapeUrl(confirmLink)}">${escapeHtml(confirmLink)}</a></p><p>If you didn't sign up, ignore this email.</p>`,
    });
}
