import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginForm from './LoginForm';

const routerReplace = vi.fn();
const routerRefresh = vi.fn();
const signInAction = vi.fn();
const clearAllCaches = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: routerReplace, refresh: routerRefresh }),
}));
vi.mock('next/link', () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
vi.mock('@/actions/auth-actions', () => ({ signInAction: (...args) => signInAction(...args) }));
vi.mock('@/lib/cache/clear-client-caches', () => ({
    clearAllCaches: (...args) => clearAllCaches(...args),
}));
vi.mock('@/components/auth/GuestEntryButton', () => ({ default: () => null }));

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
    beforeEach(() => vi.clearAllMocks());

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
