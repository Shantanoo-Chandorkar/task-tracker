const COPY_BY_ACTION = {
    reject: {
        loadingMessage: 'Rejecting...',
        successMessage: 'Request rejected',
        description: "They'll need to send a new request to join.",
        confirmLabel: 'Reject',
        title: (label) => `Reject request from "${label}"?`,
    },
    remove: {
        loadingMessage: 'Removing...',
        successMessage: 'Collaborator removed',
        description: "They'll lose access to this space's lists and tasks.",
        confirmLabel: 'Remove',
        title: (label) => `Remove "${label}" from this space?`,
    },
    'revoke-invite': {
        loadingMessage: 'Revoking...',
        successMessage: 'Invite revoked',
        description: 'The link in their email will stop working.',
        confirmLabel: 'Revoke',
        title: (label) => `Revoke the invite sent to "${label}"?`,
    },
};

/**
 * Gives the toast texts for one sharing confirm action.
 *
 * @param {'reject'|'remove'|'revoke-invite'} action - What the popup confirms
 * @returns {{ loadingMessage: string, successMessage: string }} Toast texts
 */
export function getSharingToasts(action) {
    const { loadingMessage, successMessage } = COPY_BY_ACTION[action];
    return { loadingMessage, successMessage };
}

/**
 * Words the confirm popup for rejecting a request, removing a collaborator, or revoking an invite.
 *
 * @param {{ action: 'reject'|'remove'|'revoke-invite', label: string }|null} confirmTarget - What the user chose;
 *   `label` is the person's email
 * @returns {{ title: string, description: string, confirmLabel: string }|null} Texts for the popup, or null when
 *   no popup is open
 */
export function describeSharingConfirm(confirmTarget) {
    if (!confirmTarget) return null;
    const { title, description, confirmLabel } = COPY_BY_ACTION[confirmTarget.action];
    return { title: title(confirmTarget.label), description, confirmLabel };
}
