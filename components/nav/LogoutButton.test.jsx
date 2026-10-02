import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LogoutButton from './LogoutButton';

const routerPush = vi.fn();
const signOutAction = vi.fn();
const clearAllCaches = vi.fn();
const toastError = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush, refresh: vi.fn() }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('sonner', () => ({
    toast: { loading: () => 'toast-id', success: vi.fn(), error: (...args) => toastError(...args) },
}));
vi.mock('@/actions/auth-actions', () => ({ signOutAction: (...args) => signOutAction(...args) }));
vi.mock('@/lib/cache', () => ({ clearAllCaches: (...args) => clearAllCaches(...args) }));
vi.mock('@/hooks/useCurrentUserProfileQuery', () => ({
    useCurrentUserProfileQuery: () => ({ data: { is_guest: false } }),
}));

const logoutButton = () => screen.getByRole('button', { name: 'Log out' });

describe('LogoutButton', () => {
    beforeEach(() => vi.clearAllMocks());

    it('stays locked after a successful sign-out until navigation starts', async () => {
        signOutAction.mockResolvedValue({ error: null });
        let finishClearingCaches;
        clearAllCaches.mockReturnValue(new Promise((resolve) => (finishClearingCaches = resolve)));
        render(<LogoutButton />);

        fireEvent.click(logoutButton());
        await waitFor(() => expect(clearAllCaches).toHaveBeenCalledTimes(1));

        expect(logoutButton().disabled).toBe(true);
        expect(routerPush).not.toHaveBeenCalled();

        finishClearingCaches();
        await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/login'));
        expect(signOutAction).toHaveBeenCalledTimes(1);
    });

    it('re-enables the button and reports the error when sign-out fails', async () => {
        signOutAction.mockResolvedValue({ error: 'Could not sign out' });
        render(<LogoutButton />);

        fireEvent.click(logoutButton());

        await waitFor(() =>
            expect(toastError).toHaveBeenCalledWith('Could not sign out', { id: 'toast-id' }),
        );
        expect(logoutButton().disabled).toBe(false);
        expect(routerPush).not.toHaveBeenCalled();
    });
});
