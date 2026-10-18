import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StandaloneSessionForm from './StandaloneSessionForm';

const start = vi.fn();
vi.mock('@/hooks/useTimeSessionActions', () => ({
    useTimeSessionActions: () => ({ start }),
}));

beforeEach(() => start.mockReset());

describe('StandaloneSessionForm', () => {
    it('starts a session with the typed label', () => {
        start.mockResolvedValue(true);
        render(<StandaloneSessionForm />);

        fireEvent.change(screen.getByLabelText('Session label'), {
            target: { value: 'Deep work' },
        });
        fireEvent.click(screen.getByText('Start'));

        expect(start).toHaveBeenCalledWith({ label: 'Deep work' });
    });

    it('clears the label after a successful start', async () => {
        start.mockResolvedValue(true);
        render(<StandaloneSessionForm />);

        const labelInput = screen.getByLabelText('Session label');
        fireEvent.change(labelInput, { target: { value: 'Deep work' } });
        fireEvent.click(screen.getByText('Start'));

        await waitFor(() => expect(labelInput.value).toBe(''));
    });

    it('keeps the typed label when starting fails, so nothing is lost', async () => {
        start.mockResolvedValue(false);
        render(<StandaloneSessionForm />);

        const labelInput = screen.getByLabelText('Session label');
        fireEvent.change(labelInput, { target: { value: 'Deep work' } });
        fireEvent.click(screen.getByText('Start'));

        await waitFor(() => expect(start).toHaveBeenCalled());
        expect(labelInput.value).toBe('Deep work');
    });

    it('disables the input and button while starting', () => {
        let finishStart;
        start.mockReturnValueOnce(new Promise((resolve) => (finishStart = resolve)));
        render(<StandaloneSessionForm />);

        fireEvent.click(screen.getByText('Start'));

        expect(screen.getByLabelText('Session label').disabled).toBe(true);
        expect(screen.getByText('Start').closest('button').disabled).toBe(true);

        finishStart(true);
    });
});
