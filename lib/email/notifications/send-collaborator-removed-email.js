import { sendEmail, escapeHtml } from '@/lib/email/engine';

/**
 * Notifies a collaborator that the space owner removed them from a space.
 *
 * @param {string} collaboratorEmail - Address of the removed collaborator.
 * @param {string} spaceName - Name of the space they were removed from.
 * @returns {Promise<void>}
 */
export async function sendCollaboratorRemovedEmail(collaboratorEmail, spaceName) {
    await sendEmail({
        toEmail: collaboratorEmail,
        subject: `You were removed from "${spaceName}"`,
        plainTextBody: `The owner removed you from the space "${spaceName}". You no longer have access to it.`,
        htmlBody: `<p>The owner removed you from the space "${escapeHtml(spaceName)}". You no longer have access to it.</p>`,
    });
}
