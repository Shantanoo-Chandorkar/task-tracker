import { sendEmail, escapeHtml } from '@/lib/email/engine';

/**
 * Notifies a space owner that an accepted collaborator has left the space.
 *
 * @param {string} ownerEmail - Space owner's address.
 * @param {string} spaceName - Name of the space that was left.
 * @param {string} collaboratorEmail - Address of the collaborator who left.
 * @returns {Promise<void>}
 */
export async function sendCollaboratorLeftEmail(ownerEmail, spaceName, collaboratorEmail) {
    await sendEmail({
        toEmail: ownerEmail,
        subject: `${collaboratorEmail} left "${spaceName}"`,
        plainTextBody: `${collaboratorEmail} left your space "${spaceName}".`,
        htmlBody: `<p><strong>${escapeHtml(collaboratorEmail)}</strong> left your space "${escapeHtml(spaceName)}".</p>`,
    });
}
