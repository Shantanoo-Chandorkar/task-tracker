import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StandaloneSessionForm from './StandaloneSessionForm';

// Radix Select positions its listbox with ResizeObserver and scrollIntoView, which jsdom lacks
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

const start = vi.fn();
const templatesState = vi.hoisted(() => ({ templates: [] }));
vi.mock('@/hooks/useTimeSessionActions', () => ({
    useTimeSessionActions: () => ({ start }),
}));
vi.mock('@/hooks/useTimerTemplatesQuery', () => ({
    useTimerTemplatesQuery: () => ({ data: templatesState.templates }),
}));

beforeEach(() => {
    start.mockReset();
    templatesState.templates = [];
});

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

    it('hides the template picker when there are no templates', () => {
        render(<StandaloneSessionForm />);
        expect(screen.queryByRole('combobox', { name: 'Template' })).toBeNull();
    });

    it('shows and passes through the chosen template', () => {
        templatesState.templates = [{ id: 'template-1', name: 'Pomodoro' }];
        start.mockResolvedValue(true);
        render(<StandaloneSessionForm />);

        fireEvent.click(screen.getByRole('combobox', { name: 'Template' }));
        fireEvent.click(screen.getByText('Pomodoro'));
        fireEvent.click(screen.getByText('Start'));

        expect(start).toHaveBeenCalledWith({ label: '', templateId: 'template-1' });
    });
});
