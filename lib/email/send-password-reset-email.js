import { sendEmail } from '@/lib/email/send-email';

/**
 * Sends the password-reset link via Brevo SMTP. Never throws -- comparing error vs. success
 * responses would be an account-enumeration side channel; failures are logged, never the link.
 *
 * @param {string} toEmail
 * @param {string} resetLink
 * @returns {Promise<void>}
 */
export async function sendPasswordResetEmail(toEmail, resetLink) {
    await sendEmail({
        toEmail,
        subject: 'Reset your Task Tracker password',
        text: `Reset your password: ${resetLink}\n\nIf you didn't request this, ignore this email.`,
        html: `<p>Reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you didn't request this, ignore this email.</p>`,
    });
}
