import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    createSessionClient: vi.fn(),
    createAdminClient: vi.fn(),
    generateRegistrationOptions: vi.fn(),
    verifyRegistrationResponse: vi.fn(),
    setChallengeCookie: vi.fn(),
    readAndClearChallengeCookie: vi.fn(),
    headersGet: vi.fn(),
    checkRateLimit: vi.fn(),
    recordFailedAttempt: vi.fn(),
    resetAttempts: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createSessionClient }));
vi.mock('@/lib/supabase/admin', () => ({ createClient: mocks.createAdminClient }));
vi.mock('next/headers', () => ({ headers: async () => ({ get: mocks.headersGet }) }));
vi.mock('@/lib/auth/rate-limit', () => ({
    checkRateLimit: mocks.checkRateLimit,
    recordFailedAttempt: mocks.recordFailedAttempt,
    resetAttempts: mocks.resetAttempts,
    getClientIp: () => '1.2.3.4',
    LOCKOUT_ERROR_MESSAGE: (minutes) => `Too many attempts. Try again in ${minutes} minutes.`,
}));
vi.mock('@/lib/webauthn/config', () => ({
    WEBAUTHN_RP_NAME: 'Task Tracker',
    getWebauthnOrigin: () => 'https://example.com',
    getWebauthnRpId: () => 'example.com',
}));
vi.mock('@simplewebauthn/server', () => ({
    generateRegistrationOptions: mocks.generateRegistrationOptions,
    verifyRegistrationResponse: mocks.verifyRegistrationResponse,
}));
vi.mock('@simplewebauthn/server/helpers', () => ({
    isoUint8Array: { fromUTF8String: (value) => new Uint8Array(Buffer.from(value)) },
}));
vi.mock('@/lib/webauthn/challenge-cookies', () => ({
    WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE: 'webauthn_registration_challenge',
    setChallengeCookie: mocks.setChallengeCookie,
    readAndClearChallengeCookie: mocks.readAndClearChallengeCookie,
}));

const {
    getPasskeyRegistrationOptionsAction,
    verifyPasskeyRegistrationAction,
    listPasskeysAction,
    revokePasskeyAction,
} = await import('./webauthn-actions');

const OWNER = { id: 'owner-1', is_anonymous: false, email: 'owner@example.com' };
const GUEST = { id: 'guest-1', is_anonymous: true, email: null };

/** A chainable stand-in for a Supabase query: every method returns itself and it resolves to `queryResult`. */
function buildQuery(queryResult) {
    const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        insert: vi.fn(() => query),
        delete: vi.fn(() => query),
        single: () => Promise.resolve(queryResult),
        maybeSingle: () => Promise.resolve(queryResult),
        then: (resolve, reject) => Promise.resolve(queryResult).then(resolve, reject),
    };
    return query;
}

let sessionQueries;
let adminQueries;

/**
 * Wires the mocked session client (what RLS lets the caller see) and admin client (service writes).
 *
 * @param {{ user?: object, sessionResult?: object, adminResult?: object }} scenario - What the database returns.
 */
function setUpWorld({
    user = OWNER,
    sessionResult = { data: [], count: 0, error: null },
    adminResult,
} = {}) {
    mocks.getCurrentUser.mockResolvedValue(user);
    sessionQueries = buildQuery(sessionResult);
    mocks.createSessionClient.mockResolvedValue({ from: () => sessionQueries });
    if (adminResult) {
        adminQueries = buildQuery(adminResult);
        mocks.createAdminClient.mockReturnValue({ from: () => adminQueries });
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.headersGet.mockReturnValue(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    );
    mocks.checkRateLimit.mockResolvedValue({ isLocked: false, retryAfterMinutes: null });
});

describe('getPasskeyRegistrationOptionsAction', () => {
    it('refuses a guest', async () => {
        setUpWorld({ user: GUEST });
        expect(await getPasskeyRegistrationOptionsAction()).toMatchObject({
            data: null,
            code: 'GUEST_ACTION_NOT_ALLOWED',
        });
    });

    it('refuses an unauthenticated caller', async () => {
        setUpWorld({ user: null });
        expect(await getPasskeyRegistrationOptionsAction()).toMatchObject({
            data: null,
            code: 'NOT_AUTHENTICATED',
        });
    });

    it('builds options, excludes existing credentials, and stores the challenge cookie', async () => {
        setUpWorld({
            sessionResult: {
                data: [{ credential_id: 'existing-cred', transports: ['internal'] }],
                count: 1,
                error: null,
            },
        });
        mocks.generateRegistrationOptions.mockResolvedValue({ challenge: 'the-challenge', rp: {} });

        const result = await getPasskeyRegistrationOptionsAction();

        expect(mocks.generateRegistrationOptions).toHaveBeenCalledWith(
            expect.objectContaining({
                userName: OWNER.email,
                excludeCredentials: [{ id: 'existing-cred', transports: ['internal'] }],
                authenticatorSelection: {
                    residentKey: 'required',
                    userVerification: 'required',
                    authenticatorAttachment: 'platform',
                },
            }),
        );
        expect(mocks.setChallengeCookie).toHaveBeenCalledWith(
            'webauthn_registration_challenge',
            'the-challenge',
        );
        expect(result).toEqual({
            data: { challenge: 'the-challenge', rp: {} },
            error: null,
            code: null,
        });
    });

    it('refuses once the device cap is reached, before generating any options', async () => {
        setUpWorld({ sessionResult: { data: [], count: 5, error: null } });

        const result = await getPasskeyRegistrationOptionsAction();

        expect(result).toMatchObject({ data: null, code: 'AUTH_WEBAUTHN_DEVICE_LIMIT_REACHED' });
        expect(mocks.generateRegistrationOptions).not.toHaveBeenCalled();
        expect(mocks.recordFailedAttempt).not.toHaveBeenCalled();
    });

    it('refuses a locked-out caller before generating any options', async () => {
        setUpWorld();
        mocks.checkRateLimit.mockResolvedValue({ isLocked: true, retryAfterMinutes: 12 });

        const result = await getPasskeyRegistrationOptionsAction();

        expect(result).toMatchObject({ data: null, code: 'AUTH_ACCOUNT_LOCKED' });
        expect(result.error).toContain('12 minutes');
        expect(mocks.generateRegistrationOptions).not.toHaveBeenCalled();
    });

    it('reports a generic infra failure when the credentials query itself fails', async () => {
        setUpWorld({
            sessionResult: { data: null, count: null, error: { message: 'connection reset' } },
        });

        expect(await getPasskeyRegistrationOptionsAction()).toMatchObject({
            data: null,
            code: 'INTERNAL_ERROR',
        });
    });
});

describe('verifyPasskeyRegistrationAction', () => {
    const ATTESTATION_RESPONSE = { id: 'new-cred', response: {} };
    const VERIFIED_CREDENTIAL = {
        verified: true,
        registrationInfo: {
            credential: {
                id: 'new-cred',
                publicKey: new Uint8Array([1, 2, 3]),
                counter: 0,
                transports: ['internal'],
            },
        },
    };

    it('refuses a guest', async () => {
        setUpWorld({ user: GUEST });
        expect(
            await verifyPasskeyRegistrationAction({ attestationResponse: ATTESTATION_RESPONSE }),
        ).toMatchObject({
            code: 'GUEST_ACTION_NOT_ALLOWED',
        });
    });

    it('refuses a locked-out caller before reading the challenge cookie', async () => {
        setUpWorld();
        mocks.checkRateLimit.mockResolvedValue({ isLocked: true, retryAfterMinutes: 7 });

        const result = await verifyPasskeyRegistrationAction({
            attestationResponse: ATTESTATION_RESPONSE,
        });

        expect(result).toMatchObject({ data: null, code: 'AUTH_ACCOUNT_LOCKED' });
        expect(mocks.readAndClearChallengeCookie).not.toHaveBeenCalled();
    });

    it('reports a missing challenge cookie instead of attempting verification, without recording a failed attempt', async () => {
        setUpWorld();
        mocks.readAndClearChallengeCookie.mockResolvedValue(null);

        const result = await verifyPasskeyRegistrationAction({
            attestationResponse: ATTESTATION_RESPONSE,
        });

        expect(result).toMatchObject({ data: null, code: 'AUTH_WEBAUTHN_CHALLENGE_MISSING' });
        expect(mocks.verifyRegistrationResponse).not.toHaveBeenCalled();
        expect(mocks.recordFailedAttempt).not.toHaveBeenCalled();
    });

    it('rejects a device label over 50 characters without attempting verification', async () => {
        setUpWorld();
        mocks.readAndClearChallengeCookie.mockResolvedValue('the-challenge');

        const result = await verifyPasskeyRegistrationAction({
            attestationResponse: ATTESTATION_RESPONSE,
            deviceLabel: 'x'.repeat(51),
        });

        expect(result).toMatchObject({ data: null, code: 'INPUT_TOO_LONG' });
        expect(mocks.verifyRegistrationResponse).not.toHaveBeenCalled();
    });

    it('maps a failed verification (verified: false) to a stable code and records a failed attempt', async () => {
        setUpWorld();
        mocks.readAndClearChallengeCookie.mockResolvedValue('the-challenge');
        mocks.verifyRegistrationResponse.mockResolvedValue({ verified: false });

        expect(
            await verifyPasskeyRegistrationAction({ attestationResponse: ATTESTATION_RESPONSE }),
        ).toMatchObject({
            data: null,
            code: 'AUTH_WEBAUTHN_REGISTRATION_FAILED',
        });
        expect(mocks.recordFailedAttempt).toHaveBeenCalledWith(
            'webauthn_reg_verify',
            OWNER.email,
            '1.2.3.4',
        );
    });

    it('maps a thrown verification error to the same stable code, never leaking the raw error, and records a failed attempt', async () => {
        setUpWorld();
        mocks.readAndClearChallengeCookie.mockResolvedValue('the-challenge');
        mocks.verifyRegistrationResponse.mockRejectedValue(new Error('malformed CBOR'));

        const result = await verifyPasskeyRegistrationAction({
            attestationResponse: ATTESTATION_RESPONSE,
        });

        expect(result).toEqual({
            data: null,
            error: 'Could not verify that passkey. Please try again.',
            code: 'AUTH_WEBAUTHN_REGISTRATION_FAILED',
        });
        expect(mocks.recordFailedAttempt).toHaveBeenCalledWith(
            'webauthn_reg_verify',
            OWNER.email,
            '1.2.3.4',
        );
    });

    it('saves the credential via the admin client and derives a device label from the User-Agent', async () => {
        setUpWorld({
            adminResult: { data: { id: 'row-1', device_label: 'Chrome on Windows' }, error: null },
        });
        mocks.readAndClearChallengeCookie.mockResolvedValue('the-challenge');
        mocks.verifyRegistrationResponse.mockResolvedValue(VERIFIED_CREDENTIAL);

        const result = await verifyPasskeyRegistrationAction({
            attestationResponse: ATTESTATION_RESPONSE,
        });

        expect(adminQueries.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: OWNER.id,
                credential_id: 'new-cred',
                public_key: '\\x010203',
                sign_count: 0,
                transports: ['internal'],
                device_label: 'Chrome on Windows',
            }),
        );
        expect(result).toEqual({
            data: { id: 'row-1', device_label: 'Chrome on Windows' },
            error: null,
            code: null,
        });
        expect(mocks.resetAttempts).toHaveBeenCalledWith(
            'webauthn_reg_verify',
            OWNER.email,
            '1.2.3.4',
        );
        expect(mocks.recordFailedAttempt).not.toHaveBeenCalled();
    });

    it('uses a client-supplied device label instead of deriving one', async () => {
        setUpWorld({
            adminResult: { data: { id: 'row-1', device_label: 'My laptop' }, error: null },
        });
        mocks.readAndClearChallengeCookie.mockResolvedValue('the-challenge');
        mocks.verifyRegistrationResponse.mockResolvedValue(VERIFIED_CREDENTIAL);

        await verifyPasskeyRegistrationAction({
            attestationResponse: ATTESTATION_RESPONSE,
            deviceLabel: 'My laptop',
        });

        expect(adminQueries.insert).toHaveBeenCalledWith(
            expect.objectContaining({ device_label: 'My laptop' }),
        );
    });

    it('maps a duplicate-credential insert error to the duplicate code, without recording a failed attempt', async () => {
        setUpWorld({
            adminResult: { data: null, error: { code: '23505', message: 'duplicate key' } },
        });
        mocks.readAndClearChallengeCookie.mockResolvedValue('the-challenge');
        mocks.verifyRegistrationResponse.mockResolvedValue(VERIFIED_CREDENTIAL);

        expect(
            await verifyPasskeyRegistrationAction({ attestationResponse: ATTESTATION_RESPONSE }),
        ).toMatchObject({
            data: null,
            code: 'AUTH_WEBAUTHN_DUPLICATE_CREDENTIAL',
        });
        expect(mocks.recordFailedAttempt).not.toHaveBeenCalled();
    });

    it('never leaks a raw insert error to the client on an unrelated failure', async () => {
        setUpWorld({ adminResult: { data: null, error: { message: 'relation does not exist' } } });
        mocks.readAndClearChallengeCookie.mockResolvedValue('the-challenge');
        mocks.verifyRegistrationResponse.mockResolvedValue(VERIFIED_CREDENTIAL);

        const result = await verifyPasskeyRegistrationAction({
            attestationResponse: ATTESTATION_RESPONSE,
        });

        expect(result.error).not.toContain('relation does not exist');
        expect(result).toMatchObject({ data: null, code: 'AUTH_WEBAUTHN_REGISTRATION_FAILED' });
    });
});

describe('listPasskeysAction', () => {
    it('refuses a guest', async () => {
        setUpWorld({ user: GUEST });
        expect(await listPasskeysAction()).toMatchObject({
            data: null,
            code: 'GUEST_ACTION_NOT_ALLOWED',
        });
    });

    it('returns only display-safe columns', async () => {
        const row = {
            id: 'row-1',
            device_label: 'Chrome on Windows',
            created_at: '2026-01-01',
            last_used_at: null,
        };
        setUpWorld({ sessionResult: { data: [row], error: null } });

        expect(await listPasskeysAction()).toEqual({ data: [row], error: null, code: null });
    });

    it('reports a generic infra failure without leaking the raw error', async () => {
        setUpWorld({ sessionResult: { data: null, error: { message: 'connection reset' } } });

        const result = await listPasskeysAction();
        expect(result.error).not.toContain('connection reset');
        expect(result).toMatchObject({ data: null, code: 'INTERNAL_ERROR' });
    });
});

describe('revokePasskeyAction', () => {
    it('refuses a guest', async () => {
        setUpWorld({ user: GUEST });
        expect(await revokePasskeyAction({ passkeyId: 'not-checked' })).toMatchObject({
            code: 'GUEST_ACTION_NOT_ALLOWED',
        });
    });

    it('rejects a non-UUID id as not-found, without ever querying the database', async () => {
        setUpWorld();
        const result = await revokePasskeyAction({ passkeyId: 'not-a-uuid' });

        expect(result).toEqual({
            error: 'Passkey not found',
            code: 'AUTH_WEBAUTHN_CREDENTIAL_NOT_FOUND',
        });
        expect(sessionQueries.delete).not.toHaveBeenCalled();
    });

    it("reports not-found for someone else's (or a missing) passkey id", async () => {
        setUpWorld({ sessionResult: { data: null, error: null } });

        expect(
            await revokePasskeyAction({ passkeyId: '11111111-1111-1111-1111-111111111111' }),
        ).toEqual({ error: 'Passkey not found', code: 'AUTH_WEBAUTHN_CREDENTIAL_NOT_FOUND' });
    });

    it('revokes a passkey the caller owns', async () => {
        setUpWorld({
            sessionResult: { data: { id: '11111111-1111-1111-1111-111111111111' }, error: null },
        });

        const result = await revokePasskeyAction({
            passkeyId: '11111111-1111-1111-1111-111111111111',
        });

        expect(sessionQueries.eq).toHaveBeenCalledWith(
            'id',
            '11111111-1111-1111-1111-111111111111',
        );
        expect(result).toEqual({ error: null, code: null });
    });
});
