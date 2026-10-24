import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import PasskeySettingsSection from './PasskeySettingsSection';

const browserSupportsWebAuthn = vi.fn();
const startRegistration = vi.fn();
const getPasskeyRegistrationOptionsAction = vi.fn();
const verifyPasskeyRegistrationAction = vi.fn();

vi.mock('@simplewebauthn/browser', () => ({
    browserSupportsWebAuthn: (...args) => browserSupportsWebAuthn(...args),
    startRegistration: (...args) => startRegistration(...args),
}));
vi.mock('@/actions/webauthn-actions', () => ({
    getPasskeyRegistrationOptionsAction: (...args) => getPasskeyRegistrationOptionsAction(...args),
    verifyPasskeyRegistrationAction: (...args) => verifyPasskeyRegistrationAction(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The row itself (its own confirm-popup discipline) is covered by PasskeyRow.test.jsx.
vi.mock('@/components/settings/PasskeyRow', () => ({
    default: ({ passkey }) => <div>{passkey.device_label}</div>,
}));

let queryState;
let profileState;
const usePasskeysQuery = vi.fn(() => queryState);
vi.mock('@/hooks/usePasskeysQuery', () => ({
    usePasskeysQuery: (...args) => usePasskeysQuery(...args),
}));
vi.mock('@/hooks/useCurrentUserProfileQuery', () => ({
    useCurrentUserProfileQuery: () => ({ data: profileState }),
}));

function renderSection(props = {}) {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    render(
        <QueryClientProvider client={queryClient}>
            <PasskeySettingsSection {...props} />
        </QueryClientProvider>,
    );
    return { queryClient };
}

const registerButton = () => screen.getByRole('button', { name: /Enable passkey on this device/ });

describe('PasskeySettingsSection load states', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        browserSupportsWebAuthn.mockReturnValue(true);
        profileState = { is_guest: false };
        queryState = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    });

    it('shows a loading spinner while the list is loading', () => {
        queryState = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
        renderSection();
        expect(screen.getByText('Loading passkeys...')).toBeTruthy();
    });

    it('shows a retry button and calls refetch when the list fails to load', () => {
        const refetch = vi.fn();
        queryState = { data: undefined, isLoading: false, isError: true, refetch };
        renderSection();

        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(refetch).toHaveBeenCalled();
    });

    it('shows the empty state when there are no passkeys', () => {
        renderSection();
        expect(screen.getByText('No passkeys yet.')).toBeTruthy();
    });

    it('renders one row per passkey', () => {
        queryState = {
            data: [
                { id: 'a', device_label: 'Chrome on Windows' },
                { id: 'b', device_label: 'Safari on iPhone' },
            ],
            isLoading: false,
            isError: false,
            refetch: vi.fn(),
        };
        renderSection();
        expect(screen.getByText('Chrome on Windows')).toBeTruthy();
        expect(screen.getByText('Safari on iPhone')).toBeTruthy();
    });
});

describe('PasskeySettingsSection browser support', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        profileState = { is_guest: false };
        queryState = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    });

    it('hides the enable button and explains when the browser lacks WebAuthn', async () => {
        browserSupportsWebAuthn.mockReturnValue(false);
        renderSection();

        await waitFor(() => expect(screen.getByText(/doesn.t support passkeys yet/)).toBeTruthy());
        expect(screen.queryByRole('button', { name: /Enable passkey/ })).toBeNull();
    });

    it('shows the enable button when the browser supports WebAuthn', async () => {
        browserSupportsWebAuthn.mockReturnValue(true);
        renderSection();

        await waitFor(() => expect(registerButton()).toBeTruthy());
    });
});

describe('PasskeySettingsSection registration flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        browserSupportsWebAuthn.mockReturnValue(true);
        profileState = { is_guest: false };
        queryState = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    });

    it('runs the full ceremony and refreshes the list on success', async () => {
        getPasskeyRegistrationOptionsAction.mockResolvedValue({
            data: { challenge: 'c' },
            error: null,
        });
        startRegistration.mockResolvedValue({ id: 'new-cred' });
        verifyPasskeyRegistrationAction.mockResolvedValue({
            data: { id: 'row-1', device_label: 'Chrome on Windows' },
            error: null,
        });
        const { queryClient } = renderSection();

        await act(async () => fireEvent.click(await waitFor(() => registerButton())));

        expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'c' } });
        expect(verifyPasskeyRegistrationAction).toHaveBeenCalledWith({
            attestationResponse: { id: 'new-cred' },
        });
        expect(toast.success).toHaveBeenCalledWith('Passkey added');
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['webauthn-passkeys'],
        });
    });

    it('stops before the browser ceremony when the options call fails', async () => {
        getPasskeyRegistrationOptionsAction.mockResolvedValue({
            data: null,
            error: 'You have reached the maximum number of passkeys',
        });
        renderSection();

        await act(async () => fireEvent.click(await waitFor(() => registerButton())));

        expect(toast.error).toHaveBeenCalledWith('You have reached the maximum number of passkeys');
        expect(startRegistration).not.toHaveBeenCalled();
    });

    it('silently does nothing when the user cancels or times out the OS prompt', async () => {
        getPasskeyRegistrationOptionsAction.mockResolvedValue({ data: {}, error: null });
        const cancelled = new Error('cancelled');
        cancelled.name = 'NotAllowedError';
        startRegistration.mockRejectedValue(cancelled);
        renderSection();

        await act(async () => fireEvent.click(await waitFor(() => registerButton())));

        expect(toast.error).not.toHaveBeenCalled();
        expect(verifyPasskeyRegistrationAction).not.toHaveBeenCalled();
    });

    it('shows one generic message for any other ceremony failure, never the raw error', async () => {
        getPasskeyRegistrationOptionsAction.mockResolvedValue({ data: {}, error: null });
        startRegistration.mockRejectedValue(new Error('invalid domain for this RP ID'));
        renderSection();

        await act(async () => fireEvent.click(await waitFor(() => registerButton())));

        expect(toast.error).toHaveBeenCalledWith(
            'Could not set up your passkey. Please try again.',
        );
        expect(verifyPasskeyRegistrationAction).not.toHaveBeenCalled();
    });

    it('shows the server error when verification fails', async () => {
        getPasskeyRegistrationOptionsAction.mockResolvedValue({ data: {}, error: null });
        startRegistration.mockResolvedValue({ id: 'new-cred' });
        verifyPasskeyRegistrationAction.mockResolvedValue({
            data: null,
            error: 'This passkey is already registered.',
        });
        renderSection();

        await act(async () => fireEvent.click(await waitFor(() => registerButton())));

        expect(toast.error).toHaveBeenCalledWith('This passkey is already registered.');
    });

    it('disables the button while registering and re-enables once it settles', async () => {
        let resolveOptions;
        getPasskeyRegistrationOptionsAction.mockReturnValue(
            new Promise((resolve) => (resolveOptions = resolve)),
        );
        renderSection();

        fireEvent.click(await waitFor(() => registerButton()));
        expect(registerButton().disabled).toBe(true);

        await act(async () => resolveOptions({ data: null, error: 'boom' }));
        expect(registerButton().disabled).toBe(false);
    });

    it('shows a connection error and re-enables the button when the options call rejects', async () => {
        getPasskeyRegistrationOptionsAction.mockRejectedValue(new Error('network down'));
        renderSection();

        await act(async () => fireEvent.click(await waitFor(() => registerButton())));

        expect(toast.error).toHaveBeenCalledWith(
            'Could not reach the server. Check your connection and try again.',
        );
        expect(registerButton().disabled).toBe(false);
        expect(startRegistration).not.toHaveBeenCalled();
    });

    it('shows a connection error and re-enables the button when the verify call rejects', async () => {
        getPasskeyRegistrationOptionsAction.mockResolvedValue({ data: {}, error: null });
        startRegistration.mockResolvedValue({ id: 'new-cred' });
        verifyPasskeyRegistrationAction.mockRejectedValue(new Error('network down'));
        renderSection();

        await act(async () => fireEvent.click(await waitFor(() => registerButton())));

        expect(toast.error).toHaveBeenCalledWith(
            'Could not reach the server. Check your connection and try again.',
        );
        expect(registerButton().disabled).toBe(false);
    });
});

describe('PasskeySettingsSection guest visibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        browserSupportsWebAuthn.mockReturnValue(true);
        queryState = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    });

    it('shows a plain note and none of the load/list/register controls for a guest', () => {
        profileState = { is_guest: true };
        renderSection();

        expect(screen.getByText(/This app supports passkeys as well/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Enable passkey/ })).toBeNull();
        expect(screen.queryByText('No passkeys yet.')).toBeNull();
        expect(usePasskeysQuery).toHaveBeenCalledWith({ enabled: false });
    });

    it('renders the full section, unaffected, for a registered user', () => {
        profileState = { is_guest: false };
        renderSection();

        expect(screen.queryByText(/This app supports passkeys as well/)).toBeNull();
        expect(usePasskeysQuery).toHaveBeenCalledWith({ enabled: true });
    });
});
