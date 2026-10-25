import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logClientCeremonyFailure } from './log-client-ceremony-failure';

const ANDROID_USER_AGENT =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

describe('logClientCeremonyFailure', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('logs the surface, sanitized error details, and the derived device label', () => {
        logClientCeremonyFailure('registration', {
            errorName: 'NotSupportedError',
            errorMessage:
                'No available authenticator recognized any of the specified pubKeyCredParams',
            userAgent: ANDROID_USER_AGENT,
        });

        expect(console.error).toHaveBeenCalledWith(
            '[webauthn] client-side registration ceremony failed',
            {
                errorName: 'NotSupportedError',
                errorMessage:
                    'No available authenticator recognized any of the specified pubKeyCredParams',
                deviceLabel: 'Chrome on Android',
            },
        );
    });

    it('collapses embedded newlines so a crafted error cannot forge extra log lines', () => {
        logClientCeremonyFailure('authentication', {
            errorName: 'Error',
            errorMessage: 'real message\n[webauthn] client-side registration ceremony failed',
            userAgent: ANDROID_USER_AGENT,
        });

        expect(console.error).toHaveBeenCalledWith(
            '[webauthn] client-side authentication ceremony failed',
            expect.objectContaining({
                errorMessage: 'real message [webauthn] client-side registration ceremony failed',
            }),
        );
    });

    it('caps the length of both error fields', () => {
        logClientCeremonyFailure('registration', {
            errorName: 'x'.repeat(200),
            errorMessage: 'y'.repeat(500),
            userAgent: ANDROID_USER_AGENT,
        });

        const [, loggedDetail] = console.error.mock.calls[0];
        expect(loggedDetail.errorName).toHaveLength(100);
        expect(loggedDetail.errorMessage).toHaveLength(300);
    });

    it('never throws on a non-string error field', () => {
        expect(() =>
            logClientCeremonyFailure('registration', {
                errorName: undefined,
                errorMessage: null,
                userAgent: ANDROID_USER_AGENT,
            }),
        ).not.toThrow();
        expect(console.error).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ errorName: '', errorMessage: '' }),
        );
    });
});
