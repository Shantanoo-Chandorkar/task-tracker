import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginForm from './LoginForm';

const routerReplace = vi.fn();
const routerRefresh = vi.fn();
const signInAction = vi.fn();
const clearAllCaches = vi.fn();
const browserSupportsWebAuthnAutofill = vi.fn();
const startAuthentication = vi.fn();
const cancelCeremony = vi.fn();
const getPasskeyAuthenticationOptionsAction = vi.fn();
const verifyPasskeyAuthenticationAction = vi.fn();
const reportPasskeyLoginFailureAction = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: routerReplace, refresh: routerRefresh }),
}));
vi.mock('next/link', () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
vi.mock('@/actions/auth-actions', () => ({ signInAction: (...args) => signInAction(...args) }));
vi.mock('@/lib/cache/clear-client-caches', () => ({
    clearAllCaches: (...args) => clearAllCaches(...args),
}));
vi.mock('@/components/auth/GuestEntryButton', () => ({ default: () => null }));
vi.mock('@simplewebauthn/browser', () => ({
    browserSupportsWebAuthnAutofill: (...args) => browserSupportsWebAuthnAutofill(...args),
    startAuthentication: (...args) => startAuthentication(...args),
    WebAuthnAbortService: { cancelCeremony: (...args) => cancelCeremony(...args) },
}));
vi.mock('@/actions/webauthn-login-actions', () => ({
    getPasskeyAuthenticationOptionsAction: (...args) =>
        getPasskeyAuthenticationOptionsAction(...args),
    verifyPasskeyAuthenticationAction: (...args) => verifyPasskeyAuthenticationAction(...args),
    reportPasskeyLoginFailureAction: (...args) => reportPasskeyLoginFailureAction(...args),
}));

function renderLoginForm() {
    render(
        <QueryClientProvider client={new QueryClient()}>
            <LoginForm />
        </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), {
        target: { value: 'correct-horse' },
    });
}

const submitButton = () => screen.getByRole('button', { name: /Log(ging)? in/ });

describe('LoginForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        browserSupportsWebAuthnAutofill.mockResolvedValue(false);
    });

    it('stays locked after a successful sign-in until navigation starts', async () => {
        signInAction.mockResolvedValue({ error: null });
        let finishClearingCaches;
        clearAllCaches.mockReturnValue(new Promise((resolve) => (finishClearingCaches = resolve)));
        renderLoginForm();

        fireEvent.click(submitButton());
        await waitFor(() => expect(clearAllCaches).toHaveBeenCalledTimes(1));

        expect(submitButton().disabled).toBe(true);
        expect(routerReplace).not.toHaveBeenCalled();

        finishClearingCaches();
        await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/'));
        expect(signInAction).toHaveBeenCalledTimes(1);
    });

    it('re-enables the button and shows the error when the sign-in is rejected', async () => {
        signInAction.mockResolvedValue({ error: 'Wrong email or password' });
        renderLoginForm();

        fireEvent.click(submitButton());

        await screen.findByText('Wrong email or password');
        expect(submitButton().disabled).toBe(false);
        expect(clearAllCaches).not.toHaveBeenCalled();
    });

    it('announces the error and ties it to both fields', async () => {
        signInAction.mockResolvedValue({ error: 'Wrong email or password' });
        renderLoginForm();

        fireEvent.click(submitButton());

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toBe('Wrong email or password');
        for (const field of [
            screen.getByLabelText('Email'),
            screen.getByLabelText('Password', { selector: 'input' }),
        ]) {
            expect(field.getAttribute('aria-invalid')).toBe('true');
            expect(field.getAttribute('aria-describedby')).toBe(alert.id);
        }
    });

    it('marks both fields as required', () => {
        renderLoginForm();

        expect(screen.getByLabelText('Email').getAttribute('aria-required')).toBe('true');
        expect(
            screen.getByLabelText('Password', { selector: 'input' }).getAttribute('aria-required'),
        ).toBe('true');
    });

    it('clears the previous error as soon as a new attempt starts', async () => {
        signInAction.mockResolvedValueOnce({ error: 'Wrong email or password' });
        renderLoginForm();
        fireEvent.click(submitButton());
        await screen.findByText('Wrong email or password');

        signInAction.mockReturnValue(new Promise(() => {}));
        fireEvent.click(submitButton());

        await waitFor(() => expect(screen.queryByText('Wrong email or password')).toBeNull());
    });

    it('goes to the app once, with no second refresh request, and stays locked meanwhile', async () => {
        signInAction.mockResolvedValue({ error: null });
        clearAllCaches.mockResolvedValue();
        renderLoginForm();

        fireEvent.click(submitButton());
        await waitFor(() => expect(routerReplace).toHaveBeenCalledTimes(1));
        fireEvent.click(submitButton());

        expect(routerRefresh).not.toHaveBeenCalled();
        expect(submitButton().disabled).toBe(true);
        expect(signInAction).toHaveBeenCalledTimes(1);
    });
});

describe('LoginForm passkey autofill login', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        reportPasskeyLoginFailureAction.mockResolvedValue({ error: null, code: null });
    });

    it('never asks the server for options when the browser lacks autofill support', async () => {
        browserSupportsWebAuthnAutofill.mockResolvedValue(false);
        renderLoginForm();

        await waitFor(() => expect(browserSupportsWebAuthnAutofill).toHaveBeenCalledTimes(1));
        expect(getPasskeyAuthenticationOptionsAction).not.toHaveBeenCalled();
    });

    it('stays silent when the autofill ceremony is dismissed, leaving the password form usable', async () => {
        browserSupportsWebAuthnAutofill.mockResolvedValue(true);
        getPasskeyAuthenticationOptionsAction.mockResolvedValue({
            data: { challenge: 'c' },
            error: null,
        });
        const dismissed = new Error('cancelled');
        dismissed.name = 'NotAllowedError';
        startAuthentication.mockRejectedValue(dismissed);
        signInAction.mockReturnValue(new Promise(() => {}));
        renderLoginForm();

        await waitFor(() => expect(startAuthentication).toHaveBeenCalledTimes(1));
        expect(verifyPasskeyAuthenticationAction).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(reportPasskeyLoginFailureAction).not.toHaveBeenCalled();

        fireEvent.click(submitButton());
        await waitFor(() => expect(signInAction).toHaveBeenCalledTimes(1));
    });

    it('stays silent but reports a genuine ceremony failure server-side, never to the browser console', async () => {
        browserSupportsWebAuthnAutofill.mockResolvedValue(true);
        getPasskeyAuthenticationOptionsAction.mockResolvedValue({
            data: { challenge: 'c' },
            error: null,
        });
        startAuthentication.mockRejectedValue(
            new Error(
                'No available authenticator recognized any of the specified pubKeyCredParams',
            ),
        );
        signInAction.mockReturnValue(new Promise(() => {}));
        renderLoginForm();

        await waitFor(() =>
            expect(reportPasskeyLoginFailureAction).toHaveBeenCalledWith({
                errorName: 'Error',
                errorMessage:
                    'No available authenticator recognized any of the specified pubKeyCredParams',
            }),
        );
        expect(screen.queryByRole('alert')).toBeNull();

        fireEvent.click(submitButton());
        await waitFor(() => expect(signInAction).toHaveBeenCalledTimes(1));
    });

    it('signs in once the user picks a passkey from the autofill prompt', async () => {
        browserSupportsWebAuthnAutofill.mockResolvedValue(true);
        getPasskeyAuthenticationOptionsAction.mockResolvedValue({
            data: { challenge: 'c' },
            error: null,
        });
        startAuthentication.mockResolvedValue({ id: 'assertion-1' });
        verifyPasskeyAuthenticationAction.mockResolvedValue({ error: null });
        clearAllCaches.mockResolvedValue();
        renderLoginForm();

        await waitFor(() =>
            expect(verifyPasskeyAuthenticationAction).toHaveBeenCalledWith({
                assertionResponse: { id: 'assertion-1' },
            }),
        );
        await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/'));
        expect(clearAllCaches).toHaveBeenCalledTimes(1);
    });

    it('shows the server error from a failed passkey verification and leaves the password form usable', async () => {
        browserSupportsWebAuthnAutofill.mockResolvedValue(true);
        getPasskeyAuthenticationOptionsAction.mockResolvedValue({
            data: { challenge: 'c' },
            error: null,
        });
        startAuthentication.mockResolvedValue({ id: 'assertion-1' });
        verifyPasskeyAuthenticationAction.mockResolvedValue({
            error: 'Too many attempts. Try again in 5 minutes.',
        });
        signInAction.mockResolvedValue({ error: null });
        clearAllCaches.mockResolvedValue();
        renderLoginForm();

        await screen.findByText('Too many attempts. Try again in 5 minutes.');
        expect(routerReplace).not.toHaveBeenCalled();

        // The failed passkey attempt must not permanently lock out the password path.
        fireEvent.click(submitButton());
        await waitFor(() => expect(signInAction).toHaveBeenCalledTimes(1));
    });

    it('never asks for options when a transport failure rejects the options call', async () => {
        browserSupportsWebAuthnAutofill.mockResolvedValue(true);
        getPasskeyAuthenticationOptionsAction.mockRejectedValue(new Error('network down'));
        signInAction.mockReturnValue(new Promise(() => {}));
        renderLoginForm();

        await waitFor(() => expect(getPasskeyAuthenticationOptionsAction).toHaveBeenCalledTimes(1));
        expect(startAuthentication).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).toBeNull();

        fireEvent.click(submitButton());
        await waitFor(() => expect(signInAction).toHaveBeenCalledTimes(1));
    });

    it('unlocks the form with a connection message when verification rejects on a transport failure', async () => {
        browserSupportsWebAuthnAutofill.mockResolvedValue(true);
        getPasskeyAuthenticationOptionsAction.mockResolvedValue({
            data: { challenge: 'c' },
            error: null,
        });
        startAuthentication.mockResolvedValue({ id: 'assertion-1' });
        verifyPasskeyAuthenticationAction.mockRejectedValue(new Error('network down'));
        signInAction.mockResolvedValue({ error: null });
        clearAllCaches.mockResolvedValue();
        renderLoginForm();

        await screen.findByText('Could not reach the server. Check your connection and try again.');
        expect(submitButton().disabled).toBe(false);

        // Not permanently stuck: the password path still works after the transport failure.
        fireEvent.click(submitButton());
        await waitFor(() => expect(signInAction).toHaveBeenCalledTimes(1));
    });

    it('lets whichever of password submit or a resolved passkey pick settles first win', async () => {
        browserSupportsWebAuthnAutofill.mockResolvedValue(true);
        getPasskeyAuthenticationOptionsAction.mockResolvedValue({
            data: { challenge: 'c' },
            error: null,
        });
        let resolveAssertion;
        startAuthentication.mockReturnValue(new Promise((resolve) => (resolveAssertion = resolve)));
        verifyPasskeyAuthenticationAction.mockReturnValue(new Promise(() => {}));
        renderLoginForm();

        await waitFor(() => expect(startAuthentication).toHaveBeenCalledTimes(1));
        // The user submits the password form before the background passkey pick resolves.
        fireEvent.click(submitButton());
        await waitFor(() => expect(signInAction).toHaveBeenCalledTimes(1));

        await act(async () => resolveAssertion({ id: 'assertion-1' }));
        expect(verifyPasskeyAuthenticationAction).not.toHaveBeenCalled();
    });

    it('cancels a still-pending ceremony on unmount', async () => {
        browserSupportsWebAuthnAutofill.mockResolvedValue(true);
        getPasskeyAuthenticationOptionsAction.mockReturnValue(new Promise(() => {}));
        const { unmount } = render(
            <QueryClientProvider client={new QueryClient()}>
                <LoginForm />
            </QueryClientProvider>,
        );

        await waitFor(() => expect(getPasskeyAuthenticationOptionsAction).toHaveBeenCalledTimes(1));
        unmount();

        expect(cancelCeremony).toHaveBeenCalledTimes(1);
    });
});
