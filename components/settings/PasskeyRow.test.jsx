import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PasskeyRow from './PasskeyRow';

const revokePasskeyAction = vi.fn();

vi.mock('@/actions/webauthn-actions', () => ({
    revokePasskeyAction: (...args) => revokePasskeyAction(...args),
}));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('sonner', () => ({
    toast: { loading: () => 'toast-id', success: vi.fn(), dismiss: vi.fn(), error: vi.fn() },
}));

const PASSKEY = {
    id: 'passkey-1',
    device_label: 'Chrome on Windows',
    created_at: new Date().toISOString(),
    last_used_at: null,
};

function renderRow() {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['webauthn-passkeys'], [PASSKEY]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    render(
        <QueryClientProvider client={queryClient}>
            <PasskeyRow passkey={PASSKEY} />
        </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove passkey' }));
    return { queryClient };
}

// While pending the spinner adds an accessible name, so the label is "LoadingRemove"
const confirmButton = () => screen.getByRole('button', { name: /^(Loading)?Remove$/ });

describe('PasskeyRow', () => {
    beforeEach(() => vi.clearAllMocks());

    it('shows the device label and "never used" when last_used_at is null', () => {
        renderRow();
        expect(screen.getByText('Chrome on Windows')).toBeTruthy();
        expect(screen.getByText(/Never used yet/)).toBeTruthy();
    });

    it('stays open and locked while removing, then removes the row before it closes', async () => {
        let finishRevoke;
        revokePasskeyAction.mockReturnValue(new Promise((resolve) => (finishRevoke = resolve)));
        const { queryClient } = renderRow();

        fireEvent.click(confirmButton());

        expect(screen.getByText(/Remove .Chrome on Windows.\?/)).toBeTruthy();
        expect(confirmButton().disabled).toBe(true);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.getByText(/Remove .Chrome on Windows.\?/)).toBeTruthy();
        expect(queryClient.getQueryData(['webauthn-passkeys'])).toHaveLength(1);

        await act(async () => finishRevoke({ error: null }));

        await waitFor(() => expect(queryClient.getQueryData(['webauthn-passkeys'])).toEqual([]));
    });

    it('stays open with the error and a working button when the server refuses', async () => {
        revokePasskeyAction.mockResolvedValue({ error: 'Passkey not found' });
        const { queryClient } = renderRow();

        fireEvent.click(confirmButton());

        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('not found'));
        expect(screen.getByText(/Remove .Chrome on Windows.\?/)).toBeTruthy();
        expect(confirmButton().disabled).toBe(false);
        expect(queryClient.getQueryData(['webauthn-passkeys'])).toHaveLength(1);
    });

    it('sends exactly one request when the confirm button is clicked twice in a row', async () => {
        let callCount = 0;
        revokePasskeyAction.mockImplementation(() => {
            callCount += 1;
            return new Promise(() => {});
        });
        renderRow();

        fireEvent.click(confirmButton());
        fireEvent.click(confirmButton());

        expect(callCount).toBe(1);
    });
});
