import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    createSessionClient: vi.fn(),
    createAdminClient: vi.fn(),
    sendJoinRequestEmail: vi.fn(),
    sendJoinDecisionEmail: vi.fn(),
    sendCollaboratorLeftEmail: vi.fn(),
    sendCollaboratorRemovedEmail: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createSessionClient }));
vi.mock('@/lib/supabase/admin', () => ({ createClient: mocks.createAdminClient }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/email/notifications/send-join-request-email', () => ({
    sendJoinRequestEmail: mocks.sendJoinRequestEmail,
}));
vi.mock('@/lib/email/notifications/send-join-decision-email', () => ({
    sendJoinDecisionEmail: mocks.sendJoinDecisionEmail,
}));
vi.mock('@/lib/email/notifications/send-collaborator-left-email', () => ({
    sendCollaboratorLeftEmail: mocks.sendCollaboratorLeftEmail,
}));
vi.mock('@/lib/email/notifications/send-collaborator-removed-email', () => ({
    sendCollaboratorRemovedEmail: mocks.sendCollaboratorRemovedEmail,
}));
vi.mock('@/lib/email/notifications/send-password-reset-email', () => ({ sendPasswordResetEmail: vi.fn() }));
vi.mock('@/lib/email/notifications/send-signup-confirmation-email', () => ({ sendSignupConfirmationEmail: vi.fn() }));
vi.mock('@/lib/email/notifications/send-existing-account-email', () => ({ sendExistingAccountEmail: vi.fn() }));

const {
    requestToJoinSpace,
    approveJoinRequest,
    rejectJoinRequest,
    removeCollaborator,
    leaveSpace,
} = await import('./collaboration-actions');
const { updatePasswordAction } = await import('./auth-actions');
const { GUEST_ERROR_CODES } = await import('@/lib/guest/guest-error-codes');

const GUEST_USER = { id: 'guest-1', is_anonymous: true, email: null };
const REGISTERED_USER = { id: 'user-1', is_anonymous: false, email: 'person@example.com' };
const VALID_SPACE_ID = '123e4567-e89b-42d3-a456-426614174000';
const LONG_ENOUGH_PASSWORD = 'a-long-enough-password';

/**
 * Fake Supabase client whose every query chain ends with "no row found".
 *
 * @returns {object} Client with a chainable `from`.
 */
function makeEmptyClient() {
    const queryChain = {
        select: () => queryChain,
        update: () => queryChain,
        delete: () => queryChain,
        insert: () => queryChain,
        eq: () => queryChain,
        single: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
    };
    return { from: () => queryChain, auth: { updateUser: async () => ({ error: null }) } };
}

const guestBlockedCases = [
    ['requestToJoinSpace', () => requestToJoinSpace({ spaceId: VALID_SPACE_ID })],
    ['approveJoinRequest', () => approveJoinRequest({ requestId: 'r1' })],
    ['rejectJoinRequest', () => rejectJoinRequest({ requestId: 'r1' })],
    ['removeCollaborator', () => removeCollaborator({ collaboratorId: 'c1' })],
    ['leaveSpace', () => leaveSpace({ spaceId: VALID_SPACE_ID })],
    ['updatePasswordAction', () => updatePasswordAction({ newPassword: LONG_ENOUGH_PASSWORD })],
];

beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSessionClient.mockImplementation(async () => makeEmptyClient());
    mocks.createAdminClient.mockImplementation(() => makeEmptyClient());
});

describe('guest is refused before anything is read, written or sent', () => {
    beforeEach(() => mocks.getCurrentUser.mockResolvedValue(GUEST_USER));

    it.each(guestBlockedCases)('%s returns GUEST_ACTION_NOT_ALLOWED', async (actionName, callAction) => {
        const actionResult = await callAction();
        expect(actionResult.code).toBe(GUEST_ERROR_CODES.ACTION_NOT_ALLOWED);
        expect(actionResult.error).toBeTruthy();
    });

    it.each(guestBlockedCases)('%s touches no database and sends no email', async (actionName, callAction) => {
        await callAction();
        expect(mocks.createSessionClient).not.toHaveBeenCalled();
        expect(mocks.createAdminClient).not.toHaveBeenCalled();
        expect(mocks.sendJoinRequestEmail).not.toHaveBeenCalled();
        expect(mocks.sendJoinDecisionEmail).not.toHaveBeenCalled();
        expect(mocks.sendCollaboratorLeftEmail).not.toHaveBeenCalled();
        expect(mocks.sendCollaboratorRemovedEmail).not.toHaveBeenCalled();
    });

    it('keeps the data field null on the actions that normally return one', async () => {
        expect((await requestToJoinSpace({ spaceId: VALID_SPACE_ID })).data).toBeNull();
        expect((await approveJoinRequest({ requestId: 'r1' })).data).toBeNull();
    });
});

describe('a registered user is not affected by the guard', () => {
    beforeEach(() => mocks.getCurrentUser.mockResolvedValue(REGISTERED_USER));

    it('still gets each action own result, never the guest refusal', async () => {
        const registeredResults = await Promise.all([
            requestToJoinSpace({ spaceId: 'not-a-uuid' }),
            approveJoinRequest({ requestId: 'r1' }),
            rejectJoinRequest({ requestId: 'r1' }),
            removeCollaborator({ collaboratorId: 'c1' }),
            leaveSpace({ spaceId: VALID_SPACE_ID }),
            updatePasswordAction({ newPassword: 'short' }),
        ]);

        for (const registeredResult of registeredResults) {
            expect(registeredResult.code).not.toBe(GUEST_ERROR_CODES.ACTION_NOT_ALLOWED);
        }
        expect(registeredResults[0].error).toBe('Enter a valid space ID');
        expect(registeredResults[5].error).toMatch(/at least 12 characters/);
    });

    it('still reaches the database for an action that needs it', async () => {
        await approveJoinRequest({ requestId: 'r1' });
        expect(mocks.createSessionClient).toHaveBeenCalled();
    });
});

describe('a logged-out visitor still gets the login error first', () => {
    it('returns NOT_AUTHENTICATED, not the guest refusal', async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const actionResult = await approveJoinRequest({ requestId: 'r1' });
        expect(actionResult.code).toBe('NOT_AUTHENTICATED');
    });
});
