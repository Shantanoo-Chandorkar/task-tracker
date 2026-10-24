'use server';

import { headers } from 'next/headers';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoUint8Array } from '@simplewebauthn/server/helpers';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { AUTH_ERROR_CODES } from '@/lib/auth/error-codes';
import { INTERNAL_ERROR } from '@/lib/error-codes';
import {
    checkRateLimit,
    recordFailedAttempt,
    resetAttempts,
    getClientIp,
    LOCKOUT_ERROR_MESSAGE,
} from '@/lib/auth/rate-limit';
import { WEBAUTHN_RP_NAME, getWebauthnOrigin, getWebauthnRpId } from '@/lib/webauthn/config';
import {
    WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE,
    setChallengeCookie,
    readAndClearChallengeCookie,
} from '@/lib/webauthn/challenge-cookies';
import { deriveDeviceLabel } from '@/lib/webauthn/device-label';
import { encodeBytesForBytea } from '@/lib/webauthn/credential-encoding';
import { sanitizeString, checkMaxLength, isUuid } from '@/lib/validation';

const WEBAUTHN_DEVICE_LIMIT = 5;
const DEVICE_LABEL_MAX_LENGTH = 50;
// Same action-type string as the login flow's counter, but keyed by the real signed-in user's email.
const WEBAUTHN_REGISTRATION_RATE_LIMIT_ACTION = 'webauthn_reg_verify';

/**
 * Builds the options for `navigator.credentials.create()` and stores the challenge cookie.
 *
 * Refuses before building anything once the account already holds the device cap.
 *
 * @returns {Promise<{ data: object|null, error: string|null, code: string|null }>}
 */
export const getPasskeyRegistrationOptionsAction = withAuthenticatedAction(
    '[webauthn] registration-options',
    'Unexpected error preparing passkey registration',
    async (user, supabase) => {
        const ipAddress = getClientIp(await headers());
        const { isLocked, retryAfterMinutes } = await checkRateLimit(
            WEBAUTHN_REGISTRATION_RATE_LIMIT_ACTION,
            user.email,
            ipAddress,
        );
        if (isLocked) {
            return {
                data: null,
                error: LOCKOUT_ERROR_MESSAGE(retryAfterMinutes),
                code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            };
        }

        const {
            data: existingCredentials,
            count: existingCount,
            error,
        } = await supabase
            .from('webauthn_credentials')
            .select('credential_id, transports', { count: 'exact' });
        if (error) {
            console.error('[webauthn] registration-options could not load existing credentials', {
                detail: error.message,
            });
            return {
                data: null,
                error: 'Unexpected error preparing passkey registration',
                code: INTERNAL_ERROR,
            };
        }
        if (existingCount >= WEBAUTHN_DEVICE_LIMIT) {
            return {
                data: null,
                error: `You have reached the maximum number of passkeys (${WEBAUTHN_DEVICE_LIMIT}). Remove one to add another.`,
                code: AUTH_ERROR_CODES.WEBAUTHN_DEVICE_LIMIT_REACHED,
            };
        }

        const options = await generateRegistrationOptions({
            rpName: WEBAUTHN_RP_NAME,
            rpID: getWebauthnRpId(),
            userName: user.email,
            userID: isoUint8Array.fromUTF8String(user.id),
            userDisplayName: user.email,
            attestationType: 'none',
            excludeCredentials: existingCredentials.map((credential) => ({
                id: credential.credential_id,
                transports: credential.transports ?? undefined,
            })),
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'required',
                authenticatorAttachment: 'platform',
            },
        });

        await setChallengeCookie(WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE, options.challenge);
        return { data: options, error: null, code: null };
    },
    { blockGuest: true },
);

/**
 * Verifies a completed registration ceremony and stores the new passkey.
 *
 * @param {object} fields
 * @param {object} fields.attestationResponse - The browser's startRegistration() result.
 * @param {string} [fields.deviceLabel] - Optional user-chosen label; derived from the User-Agent when omitted.
 * @returns {Promise<{ data: object|null, error: string|null, code: string|null }>}
 */
export const verifyPasskeyRegistrationAction = withAuthenticatedAction(
    '[webauthn] registration-verify',
    'Unexpected error saving your passkey',
    async (user, supabase, fields) => {
        const ipAddress = getClientIp(await headers());
        const { isLocked, retryAfterMinutes } = await checkRateLimit(
            WEBAUTHN_REGISTRATION_RATE_LIMIT_ACTION,
            user.email,
            ipAddress,
        );
        if (isLocked) {
            return {
                data: null,
                error: LOCKOUT_ERROR_MESSAGE(retryAfterMinutes),
                code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            };
        }

        const challenge = await readAndClearChallengeCookie(WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE);
        if (!challenge) {
            return {
                data: null,
                error: 'Your passkey setup took too long. Please try again.',
                code: AUTH_ERROR_CODES.WEBAUTHN_CHALLENGE_MISSING,
            };
        }

        const suppliedLabel = sanitizeString(fields.deviceLabel ?? '');
        if (suppliedLabel) {
            const lengthError = checkMaxLength(
                suppliedLabel,
                DEVICE_LABEL_MAX_LENGTH,
                'Device label',
            );
            if (lengthError) return { data: null, ...lengthError };
        }
        const deviceLabel = suppliedLabel || deriveDeviceLabel((await headers()).get('user-agent'));

        let verification;
        try {
            verification = await verifyRegistrationResponse({
                response: fields.attestationResponse,
                expectedChallenge: challenge,
                expectedOrigin: getWebauthnOrigin(),
                expectedRPID: getWebauthnRpId(),
                requireUserVerification: true,
            });
        } catch (thrown) {
            console.error('[webauthn] registration-verify threw', { detail: thrown?.message });
            await recordFailedAttempt(
                WEBAUTHN_REGISTRATION_RATE_LIMIT_ACTION,
                user.email,
                ipAddress,
            );
            return {
                data: null,
                error: 'Could not verify that passkey. Please try again.',
                code: AUTH_ERROR_CODES.WEBAUTHN_REGISTRATION_FAILED,
            };
        }
        if (!verification.verified) {
            await recordFailedAttempt(
                WEBAUTHN_REGISTRATION_RATE_LIMIT_ACTION,
                user.email,
                ipAddress,
            );
            return {
                data: null,
                error: 'Could not verify that passkey. Please try again.',
                code: AUTH_ERROR_CODES.WEBAUTHN_REGISTRATION_FAILED,
            };
        }

        const { credential } = verification.registrationInfo;
        const adminClient = createAdminClient();
        const { data: insertedRow, error: insertError } = await adminClient
            .from('webauthn_credentials')
            .insert({
                user_id: user.id,
                credential_id: credential.id,
                public_key: encodeBytesForBytea(credential.publicKey),
                sign_count: credential.counter,
                transports: credential.transports ?? null,
                device_label: deviceLabel,
            })
            .select('id, device_label')
            .single();

        if (insertError?.code === '23505') {
            return {
                data: null,
                error: 'This passkey is already registered.',
                code: AUTH_ERROR_CODES.WEBAUTHN_DUPLICATE_CREDENTIAL,
            };
        }
        if (insertError) {
            console.error('[webauthn] registration-verify could not save credential', {
                detail: insertError.message,
            });
            return {
                data: null,
                error: 'Could not save your passkey. Please try again.',
                code: AUTH_ERROR_CODES.WEBAUTHN_REGISTRATION_FAILED,
            };
        }

        await resetAttempts(WEBAUTHN_REGISTRATION_RATE_LIMIT_ACTION, user.email, ipAddress);
        return { data: insertedRow, error: null, code: null };
    },
    { blockGuest: true },
);

/**
 * Lists the caller's own passkeys.
 *
 * Deliberately excludes `credential_id`, `public_key`, and `sign_count` - internal detail.
 *
 * @returns {Promise<{ data: object[]|null, error: string|null, code: string|null }>}
 */
export const listPasskeysAction = withAuthenticatedAction(
    '[webauthn] list',
    'Unexpected error loading your passkeys',
    async (user, supabase) => {
        const { data: passkeys, error } = await supabase
            .from('webauthn_credentials')
            .select('id, device_label, created_at, last_used_at')
            .order('created_at', { ascending: true });
        if (error) {
            console.error('[webauthn] list could not load passkeys', { detail: error.message });
            return {
                data: null,
                error: 'Unexpected error loading your passkeys',
                code: INTERNAL_ERROR,
            };
        }
        return { data: passkeys, error: null, code: null };
    },
    { blockGuest: true },
);

/**
 * Revokes one of the caller's own passkeys.
 *
 * @param {object} fields
 * @param {string} fields.passkeyId
 * @returns {Promise<{ error: string|null, code: string|null }>}
 */
export const revokePasskeyAction = withAuthenticatedAction(
    '[webauthn] revoke',
    'Unexpected error removing that passkey',
    async (user, supabase, fields) => {
        if (!isUuid(fields.passkeyId)) {
            return {
                error: 'Passkey not found',
                code: AUTH_ERROR_CODES.WEBAUTHN_CREDENTIAL_NOT_FOUND,
            };
        }

        const { data: deletedRow, error } = await supabase
            .from('webauthn_credentials')
            .delete()
            .eq('id', fields.passkeyId)
            .select()
            .maybeSingle();

        if (error || !deletedRow) {
            return {
                error: 'Passkey not found',
                code: AUTH_ERROR_CODES.WEBAUTHN_CREDENTIAL_NOT_FOUND,
            };
        }
        return { error: null, code: null };
    },
    { blockGuest: true, hasData: false },
);
