import nodemailer from 'nodemailer';

/**
 * Domain-free email primitives (send, escape) so a delivery failure is never confused with a notification bug.
 */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escapes user-controlled text before it is interpolated into an HTML email body.
 *
 * @param {string} unescapedText - Text that may contain HTML-significant characters.
 * @returns {string} Text safe to place in HTML.
 */
export function escapeHtml(unescapedText) {
    return String(unescapedText).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/**
 * Escapes a URL for an href attribute; anything that is not http(s) becomes '#' so it cannot run script.
 *
 * @param {string} linkUrl - URL to place inside an href.
 * @returns {string} HTML-escaped URL, or '#' when the scheme is not http or https.
 */
export function escapeUrl(linkUrl) {
    // Browsers ignore control characters and spaces inside a scheme, so strip them before checking it
    const schemeCheckedUrl = String(linkUrl).replace(/[\u0000- ]/g, '');
    if (!/^https?:\/\//i.test(schemeCheckedUrl)) return '#';
    return escapeHtml(linkUrl);
}

/**
 * Sends an email via Brevo SMTP; never throws, so a delivery failure can't change a caller's response shape.
 *
 * @param {object} emailFields
 * @param {string} emailFields.toEmail - Recipient address.
 * @param {string} emailFields.subject - Subject line.
 * @param {string} emailFields.plainTextBody - Plain-text alternative of the body.
 * @param {string} emailFields.htmlBody - HTML body; interpolated values must already be escaped.
 * @returns {Promise<{ success: boolean, error: string|null }>} Outcome, so a caller can check its own send.
 */
export async function sendEmail({ toEmail, subject, plainTextBody, htmlBody }) {
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.BREVO_SMTP_HOST,
            port: Number(process.env.BREVO_SMTP_PORT),
            secure: Number(process.env.BREVO_SMTP_PORT) === 465,
            auth: {
                user: process.env.BREVO_SMTP_USER,
                pass: process.env.BREVO_SMTP_PASS,
            },
        });

        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: toEmail,
            subject,
            text: plainTextBody,
            html: htmlBody,
        });
        return { success: true, error: null };
    } catch (thrown) {
        console.error('[email] send failed', { toEmail, subject, detail: thrown?.message });
        return { success: false, error: thrown?.message ?? 'Unknown error' };
    }
}
