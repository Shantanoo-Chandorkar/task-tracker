import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SignupForm from './SignupForm';

const signUpAction = vi.fn();

vi.mock('next/link', () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
vi.mock('@/actions/auth-actions', () => ({ signUpAction: (...args) => signUpAction(...args) }));

function fillAndSubmit() {
    render(<SignupForm />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.com' } });
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), {
        target: { value: 'a-long-enough-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign up|Creating account/ }));
}

describe('SignupForm accessibility', () => {
    beforeEach(() => vi.clearAllMocks());

    it('announces a server error and ties it to the fields', async () => {
        signUpAction.mockResolvedValue({ error: 'Enter a valid email address' });
        fillAndSubmit();

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toBe('Enter a valid email address');
        expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toContain(alert.id);
        expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
    });

    it('links the 12-character hint to the password field', () => {
        render(<SignupForm />);

        const passwordField = screen.getByLabelText('Password', { selector: 'input' });
        const hintId = passwordField.getAttribute('aria-describedby').split(' ')[0];
        expect(document.getElementById(hintId).textContent).toContain('At least 12 characters');
    });

    it('moves focus to the confirmation message when the form disappears', async () => {
        signUpAction.mockResolvedValue({ error: null });
        fillAndSubmit();

        const confirmation = (await screen.findByText('Account created.')).closest(
            '[role="status"]',
        );
        await waitFor(() => expect(document.activeElement).toBe(confirmation));
    });
});
