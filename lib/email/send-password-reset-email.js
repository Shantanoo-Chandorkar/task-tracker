import nodemailer from 'nodemailer';

/**
 * Sends the password-reset link via Brevo SMTP. Never throws -- comparing error vs. success
 * responses would be an account-enumeration side channel; failures are logged, never the link.
 *
 * @param {string} toEmail
 * @param {string} resetLink
 * @returns {Promise<void>}
 */
export async function sendPasswordResetEmail(toEmail, resetLink) {
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
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: toEmail,
            subject: 'Reset your Task Tracker password',
            text: `Reset your password: ${resetLink}\n\nIf you didn't request this, ignore this email.`,
            html: `<p>Reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you didn't request this, ignore this email.</p>`,
        });
    } catch (thrown) {
        console.error('[email] password reset send failed', { toEmail, detail: thrown?.message });
    }
}
