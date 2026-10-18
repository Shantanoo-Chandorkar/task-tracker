import { describe, expect, it } from 'vitest';
import { describeSharingConfirm, getSharingToasts } from './sharing-confirm-copy';

describe('describeSharingConfirm', () => {
    it.each([
        [
            'reject',
            'Reject request from "a@b.co"?',
            "They'll need to send a new request to join.",
            'Reject',
        ],
        [
            'remove',
            'Remove "a@b.co" from this space?',
            "They'll lose access to this space's lists and tasks.",
            'Remove',
        ],
        [
            'revoke-invite',
            'Revoke the invite sent to "a@b.co"?',
            'The link in their email will stop working.',
            'Revoke',
        ],
    ])('words the %s popup', (action, title, description, confirmLabel) => {
        expect(describeSharingConfirm({ action, label: 'a@b.co' })).toEqual({
            title,
            description,
            confirmLabel,
        });
    });

    it('gives nothing when no popup is open', () => {
        expect(describeSharingConfirm(null)).toBeNull();
    });
});

describe('getSharingToasts', () => {
    it.each([
        ['reject', 'Rejecting...', 'Request rejected'],
        ['remove', 'Removing...', 'Collaborator removed'],
        ['revoke-invite', 'Revoking...', 'Invite revoked'],
    ])('gives the %s toasts', (action, loadingMessage, successMessage) => {
        expect(getSharingToasts(action)).toEqual({ loadingMessage, successMessage });
    });
});
