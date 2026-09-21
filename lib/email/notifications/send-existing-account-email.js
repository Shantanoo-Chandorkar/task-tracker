import { sendEmail, escapeHtml, escapeUrl } from '@/lib/email/engine';

/**
 * Tells the real owner someone tried to sign up with their email, since the signup response itself stays identical.
 *
 * @param {string} toEmail - Address that already has an account.
 * @param {string} loginLink - Password-reset link, doubles as a way back in.
 * @returns {Promise<void>}
 */
export async function sendExistingAccountEmail(toEmail, loginLink) {
    await sendEmail({
        toEmail,
        subject: 'You already have a Task Tracker account',
        plainTextBody: `Someone (probably you) tried to sign up with this email, but you already have an account. Log in, or set a new password: ${loginLink}\n\nIf this wasn't you, you can ignore this email.`,
        htmlBody: `<p>Someone (probably you) tried to sign up with this email, but you already have an account.</p><p>Log in, or set a new password:</p><p><a href="${escapeUrl(loginLink)}">${escapeHtml(loginLink)}</a></p><p>If this wasn't you, you can ignore this email.</p>`,
    });
}
