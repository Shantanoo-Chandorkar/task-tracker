import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createSessionClient: vi.fn(),
    createAdminClient: vi.fn(),
    generateAuthenticationOptions: vi.fn(),
    verifyAuthenticationResponse: vi.fn(),
    setChallengeCookie: vi.fn(),
    readAndClearChallengeCookie: vi.fn(),
    checkRateLimit: vi.fn(),
    recordFailedAttempt: vi.fn(),
    resetAttempts: vi.fn(),
    logClientCeremonyFailure: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createSessionClient }));
vi.mock('@/lib/supabase/admin', () => ({ createClient: mocks.createAdminClient }));
vi.mock('next/headers', () => ({
    headers: async () =>
        new Headers({
            'x-forwarded-for': '1.2.3.4',
            'user-agent':
                'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        }),
}));
vi.mock('@/lib/webauthn/config', () => ({
    getWebauthnOrigin: () => 'https://example.com',
    getWebauthnRpId: () => 'example.com',
}));
vi.mock('@simplewebauthn/server', () => ({
    generateAuthenticationOptions: mocks.generateAuthenticationOptions,
    verifyAuthenticationResponse: mocks.verifyAuthenticationResponse,
}));
vi.mock('@/lib/webauthn/challenge-cookies', () => ({
    WEBAUTHN_AUTHENTICATION_CHALLENGE_COOKIE: 'webauthn_authentication_challenge',
    setChallengeCookie: mocks.setChallengeCookie,
    readAndClearChallengeCookie: mocks.readAndClearChallengeCookie,
}));
vi.mock('@/lib/auth/rate-limit', () => ({
    checkRateLimit: mocks.checkRateLimit,
    recordFailedAttempt: mocks.recordFailedAttempt,
    resetAttempts: mocks.resetAttempts,
    getClientIp: () => '1.2.3.4',
    LOCKOUT_ERROR_MESSAGE: (minutes) => `Too many attempts. Try again in ${minutes} minutes.`,
}));
vi.mock('@/lib/webauthn/log-client-ceremony-failure', () => ({
    logClientCeremonyFailure: mocks.logClientCeremonyFailure,
}));

const {
    getPasskeyAuthenticationOptionsAction,
    verifyPasskeyAuthenticationAction,
    reportPasskeyLoginFailureAction,
} = await import('./webauthn-login-actions');

const ASSERTION_RESPONSE = { id: 'cred-abc', response: {} };
const CREDENTIAL_ROW = {
    id: 'row-1',
    user_id: 'user-1',
    credential_id: 'cred-abc',
    public_key: '\\x010203',
    sign_count: 0,
    transports: ['internal'],
};
const AUTH_USER = { email: 'owner@example.com' };

/** A chainable stand-in for `.select(...).eq(...).maybeSingle()` plus `.update(...).eq(...)`. */
function buildCredentialsTable({ lookupResult, updateResult = { error: null } }) {
    const updateEq = vi.fn(() => Promise.resolve(updateResult));
    const update = vi.fn(() => ({ eq: updateEq }));
    const selectQuery = {
        eq: vi.fn(() => selectQuery),
        maybeSingle: vi.fn(() => Promise.resolve(lookupResult)),
    };
    const select = vi.fn(() => selectQuery);
    return { select, update, updateEq };
}

/**
 * Wires the mocked admin client (credential lookup/update, user lookup, session mint) and session client.
 *
 * @param {object} scenario - What each mocked call returns.
 */
function setUpWorld({
    lookupResult = { data: CREDENTIAL_ROW, error: null },
    updateResult = { error: null },
    getUserByIdResult = { data: { user: AUTH_USER }, error: null },
    generateLinkResult = {
        data: { properties: { hashed_token: 'hashed-token-value' } },
        error: null,
    },
    verifyOtpResult = { error: null },
} = {}) {
    const credentialsTable = buildCredentialsTable({ lookupResult, updateResult });
    mocks.createAdminClient.mockReturnValue({
        from: vi.fn(() => credentialsTable),
        auth: {
            admin: {
                getUserById: vi.fn().mockResolvedValue(getUserByIdResult),
                generateLink: vi.fn().mockResolvedValue(generateLinkResult),
            },
        },
    });
    mocks.createSessionClient.mockResolvedValue({
        auth: { verifyOtp: vi.fn().mockResolvedValue(verifyOtpResult) },
    });
    return { credentialsTable };
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ isLocked: false, retryAfterMinutes: null });
    mocks.readAndClearChallengeCookie.mockResolvedValue('the-challenge');
    mocks.verifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 1 },
    });
});

describe('getPasskeyAuthenticationOptionsAction', () => {
    it('builds options and stores the challenge cookie', async () => {
        mocks.generateAuthenticationOptions.mockResolvedValue({ challenge: 'the-challenge' });

        const result = await getPasskeyAuthenticationOptionsAction();

        expect(mocks.generateAuthenticationOptions).toHaveBeenCalledWith({
            rpID: 'example.com',
            allowCredentials: [],
            userVerification: 'required',
        });
        expect(mocks.setChallengeCookie).toHaveBeenCalledWith(
            'webauthn_authentication_challenge',
            'the-challenge',
        );
        expect(result).toEqual({ data: { challenge: 'the-challenge' }, error: null, code: null });
    });

    it('refuses during an active lockout without ever generating options', async () => {
        mocks.checkRateLimit.mockResolvedValue({ isLocked: true, retryAfterMinutes: 9 });

        const result = await getPasskeyAuthenticationOptionsAction();

        expect(result).toMatchObject({ data: null, code: 'AUTH_ACCOUNT_LOCKED' });
        expect(result.error).toContain('9 minutes');
        expect(mocks.generateAuthenticationOptions).not.toHaveBeenCalled();
    });
});

describe('verifyPasskeyAuthenticationAction', () => {
    it('refuses a locked-out caller before any crypto work runs', async () => {
        setUpWorld();
        mocks.checkRateLimit.mockResolvedValue({ isLocked: true, retryAfterMinutes: 4 });

        const result = await verifyPasskeyAuthenticationAction({
            assertionResponse: ASSERTION_RESPONSE,
        });

        expect(result).toMatchObject({ code: 'AUTH_ACCOUNT_LOCKED' });
        expect(mocks.readAndClearChallengeCookie).not.toHaveBeenCalled();
        expect(mocks.verifyAuthenticationResponse).not.toHaveBeenCalled();
    });

    it('reports a missing challenge cookie without recording a failed attempt', async () => {
        setUpWorld();
        mocks.readAndClearChallengeCookie.mockResolvedValue(null);

        const result = await verifyPasskeyAuthenticationAction({
            assertionResponse: ASSERTION_RESPONSE,
        });

        expect(result).toMatchObject({ code: 'AUTH_WEBAUTHN_CHALLENGE_MISSING' });
        expect(mocks.recordFailedAttempt).not.toHaveBeenCalled();
    });

    it('counts an unknown credential id as a failed attempt and returns the generic code', async () => {
        setUpWorld({ lookupResult: { data: null, error: null } });

        const result = await verifyPasskeyAuthenticationAction({
            assertionResponse: ASSERTION_RESPONSE,
        });

        expect(result).toEqual({
            error: 'Could not verify that passkey. Please try again.',
            code: 'AUTH_WEBAUTHN_AUTHENTICATION_FAILED',
        });
        expect(mocks.recordFailedAttempt).toHaveBeenCalledWith(
            'webauthn_auth_verify',
            '',
            '1.2.3.4',
        );
    });

    it('maps a thrown verification error to the generic code and records a failed attempt', async () => {
        setUpWorld();
        mocks.verifyAuthenticationResponse.mockRejectedValue(new Error('malformed CBOR'));

        const result = await verifyPasskeyAuthenticationAction({
            assertionResponse: ASSERTION_RESPONSE,
        });

        expect(result).toEqual({
            error: 'Could not verify that passkey. Please try again.',
            code: 'AUTH_WEBAUTHN_AUTHENTICATION_FAILED',
        });
        expect(mocks.recordFailedAttempt).toHaveBeenCalled();
    });

    it('maps a verified:false response to the generic code and records a failed attempt', async () => {
        setUpWorld();
        mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: false });

        const result = await verifyPasskeyAuthenticationAction({
            assertionResponse: ASSERTION_RESPONSE,
        });

        expect(result).toMatchObject({ code: 'AUTH_WEBAUTHN_AUTHENTICATION_FAILED' });
        expect(mocks.recordFailedAttempt).toHaveBeenCalled();
    });

    it('refuses a genuine sign-count regression and never updates or clears the credential', async () => {
        const { credentialsTable } = setUpWorld({
            lookupResult: { data: { ...CREDENTIAL_ROW, sign_count: 5 }, error: null },
        });
        mocks.verifyAuthenticationResponse.mockResolvedValue({
            verified: true,
            authenticationInfo: { newCounter: 3 },
        });

        const result = await verifyPasskeyAuthenticationAction({
            assertionResponse: ASSERTION_RESPONSE,
        });

        expect(result).toMatchObject({ code: 'AUTH_WEBAUTHN_AUTHENTICATION_FAILED' });
        expect(mocks.recordFailedAttempt).toHaveBeenCalled();
        expect(credentialsTable.update).not.toHaveBeenCalled();
    });

    it('does not flag a synced passkey repeating a 0 sign count as a regression', async () => {
        const { credentialsTable } = setUpWorld({
            lookupResult: { data: { ...CREDENTIAL_ROW, sign_count: 0 }, error: null },
        });
        mocks.verifyAuthenticationResponse.mockResolvedValue({
            verified: true,
            authenticationInfo: { newCounter: 0 },
        });

        const result = await verifyPasskeyAuthenticationAction({
            assertionResponse: ASSERTION_RESPONSE,
        });

        expect(result).toEqual({ error: null, code: null });
        expect(credentialsTable.update).toHaveBeenCalledWith(
            expect.objectContaining({ sign_count: 0 }),
        );
    });

    it('mints a real session and resets attempts on a genuine success', async () => {
        const { credentialsTable } = setUpWorld();

        const result = await verifyPasskeyAuthenticationAction({
            assertionResponse: ASSERTION_RESPONSE,
        });

        expect(credentialsTable.update).toHaveBeenCalledWith(
            expect.objectContaining({ sign_count: 1 }),
        );
        expect(mocks.resetAttempts).toHaveBeenCalledWith('webauthn_auth_verify', '', '1.2.3.4');
        expect(result).toEqual({ error: null, code: null });
    });

    it('reports a generic session-mint failure, never a raw Supabase error, after the sign_count is still updated', async () => {
        const { credentialsTable } = setUpWorld({
            generateLinkResult: { data: null, error: { message: 'service unavailable' } },
        });

        const result = await verifyPasskeyAuthenticationAction({
            assertionResponse: ASSERTION_RESPONSE,
        });

        expect(result.error).not.toContain('service unavailable');
        expect(result).toMatchObject({ code: 'AUTH_WEBAUTHN_SESSION_MINT_FAILED' });
        expect(credentialsTable.update).toHaveBeenCalledWith(
            expect.objectContaining({ sign_count: 1 }),
        );
    });
});

describe('reportPasskeyLoginFailureAction', () => {
    it('logs the ceremony failure server-side via the shared helper and reports no error back', async () => {
        const result = await reportPasskeyLoginFailureAction({
            errorName: 'NotSupportedError',
            errorMessage:
                'No available authenticator recognized any of the specified pubKeyCredParams',
        });

        expect(mocks.logClientCeremonyFailure).toHaveBeenCalledWith('authentication', {
            errorName: 'NotSupportedError',
            errorMessage:
                'No available authenticator recognized any of the specified pubKeyCredParams',
            userAgent: expect.stringContaining('Android'),
        });
        expect(result).toEqual({ error: null, code: null });
    });

    it('never throws back to the client when logging itself fails', async () => {
        mocks.logClientCeremonyFailure.mockImplementationOnce(() => {
            throw new Error('log sink unavailable');
        });

        const result = await reportPasskeyLoginFailureAction({
            errorName: 'Error',
            errorMessage: 'x',
        });

        expect(result).toEqual({ error: null, code: null });
    });
});
