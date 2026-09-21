import { sendEmail, escapeHtml, escapeUrl } from '@/lib/email/engine';

/**
 * Sends the password-reset link; failures are never surfaced, as differing responses would enable enumeration.
 *
 * @param {string} toEmail - Address requesting the reset.
 * @param {string} resetLink - One-time password-reset URL.
 * @returns {Promise<void>}
 */
export async function sendPasswordResetEmail(toEmail, resetLink) {
    await sendEmail({
        toEmail,
        subject: 'Reset your Task Tracker password',
        plainTextBody: `Reset your password: ${resetLink}\n\nIf you didn't request this, ignore this email.`,
        htmlBody: `<p>Reset your password:</p><p><a href="${escapeUrl(resetLink)}">${escapeHtml(resetLink)}</a></p><p>If you didn't request this, ignore this email.</p>`,
    });
}
