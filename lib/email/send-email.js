import nodemailer from 'nodemailer';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escapes user-controlled text before it's interpolated into an HTML email body.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/**
 * Sends an email via Brevo SMTP. Never throws -- callers must not let a delivery failure change
 * their response shape (that would be a side channel for account/space enumeration).
 *
 * @param {object} fields
 * @param {string} fields.toEmail
 * @param {string} fields.subject
 * @param {string} fields.text
 * @param {string} fields.html
 * @returns {Promise<void>}
 */
export async function sendEmail({ toEmail, subject, text, html }) {
    const transporter = nodemailer.createTransport({
        host: process.env.BREVO_SMTP_HOST,
        port: Number(process.env.BREVO_SMTP_PORT),
        secure: Number(process.env.BREVO_SMTP_PORT) === 465,
        auth: {
            user: process.env.BREVO_SMTP_USER,
            pass: process.env.BREVO_SMTP_PASS,
        },
    });

    try {
        await transporter.sendMail({ from: process.env.EMAIL_FROM, to: toEmail, subject, text, html });
    } catch (thrown) {
        console.error('[email] send failed', { toEmail, subject, detail: thrown?.message });
    }
}
