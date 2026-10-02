import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkRateLimit = vi.fn();
const resetAttempts = vi.fn();
const signInWithPassword = vi.fn();
const afterCallbacks = [];

vi.mock('next/server', () => ({ after: (callback) => afterCallbacks.push(callback) }));
vi.mock('next/headers', () => ({
    headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4' }),
}));
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { signInWithPassword: (...args) => signInWithPassword(...args) },
    }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/guest/guest-guards', () => ({ blockGuestAction: vi.fn() }));
vi.mock('@/lib/auth/rate-limit', () => ({
    checkRateLimit: (...args) => checkRateLimit(...args),
    recordFailedAttempt: vi.fn(),
    resetAttempts: (...args) => resetAttempts(...args),
    getClientIp: () => '1.2.3.4',
}));
vi.mock('@/lib/email/notifications/send-password-reset-email', () => ({}));
vi.mock('@/lib/email/notifications/send-signup-confirmation-email', () => ({}));
vi.mock('@/lib/email/notifications/send-existing-account-email', () => ({}));

describe('signInAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        afterCallbacks.length = 0;
        checkRateLimit.mockResolvedValue({ isLocked: false });
        signInWithPassword.mockResolvedValue({ error: null });
    });

    it('answers once the password is accepted and leaves the attempt-counter reset for after the response', async () => {
        resetAttempts.mockReturnValue(new Promise(() => {}));
        const { signInAction } = await import('./auth-actions');

        const signInResult = await signInAction({
            email: 'A@Example.com ',
            password: 'a-long-enough-password',
        });

        expect(signInResult).toEqual({ error: null, code: null });
        expect(resetAttempts).not.toHaveBeenCalled();
        expect(afterCallbacks).toHaveLength(1);

        afterCallbacks[0]();
        expect(resetAttempts).toHaveBeenCalledWith('signin', 'a@example.com', '1.2.3.4');
    });

    it('checks the lockout before it tries the password', async () => {
        checkRateLimit.mockResolvedValue({ isLocked: true, retryAfterMinutes: 3 });
        const { signInAction } = await import('./auth-actions');

        const signInResult = await signInAction({
            email: 'a@example.com',
            password: 'whatever-it-is-1',
        });

        expect(signInResult.error).toContain('Too many attempts');
        expect(signInWithPassword).not.toHaveBeenCalled();
    });

    it('logs a failed sign-in with its code but never the email address', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
        const { signInAction } = await import('./auth-actions');

        await signInAction({
            email: 'secret.person@example.com',
            password: 'a-long-enough-password',
        });

        expect(consoleWarn).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(consoleWarn.mock.calls[0])).not.toContain('secret.person');
        expect(consoleWarn.mock.calls[0][0]).toContain('AUTH_SIGNIN_FAILED');
        consoleWarn.mockRestore();
    });
});
