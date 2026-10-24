import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StartStandaloneTimerSheet from './StartStandaloneTimerSheet';

vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => false }));

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

function renderSheet(onClose = vi.fn()) {
    render(<StartStandaloneTimerSheet open onClose={onClose} />);
    return onClose;
}

describe('StartStandaloneTimerSheet', () => {
    it('starts a session with the typed label and closes on success', async () => {
        start.mockResolvedValue(true);
        const onClose = renderSheet();

        fireEvent.change(screen.getByLabelText('Session label'), {
            target: { value: 'Deep work' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Start' }));

        expect(start).toHaveBeenCalledWith({ label: 'Deep work' });
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('keeps the typed label and stays open when starting fails', async () => {
        start.mockResolvedValue(false);
        const onClose = renderSheet();

        const labelInput = screen.getByLabelText('Session label');
        fireEvent.change(labelInput, { target: { value: 'Deep work' } });
        fireEvent.click(screen.getByRole('button', { name: 'Start' }));

        await waitFor(() => expect(start).toHaveBeenCalled());
        expect(labelInput.value).toBe('Deep work');
        expect(onClose).not.toHaveBeenCalled();
    });

    it('disables the input and both buttons while starting', () => {
        let finishStart;
        start.mockReturnValueOnce(new Promise((resolve) => (finishStart = resolve)));
        renderSheet();

        fireEvent.click(screen.getByRole('button', { name: 'Start' }));

        expect(screen.getByLabelText('Session label').disabled).toBe(true);
        expect(screen.getByRole('button', { name: /Starting/ }).disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true);

        finishStart(true);
    });

    it('hides the template picker when there are no templates', () => {
        renderSheet();
        expect(screen.queryByRole('combobox', { name: 'Template' })).toBeNull();
    });

    it('shows and passes through the chosen template', () => {
        templatesState.templates = [{ id: 'template-1', name: 'Pomodoro' }];
        start.mockResolvedValue(true);
        renderSheet();

        fireEvent.click(screen.getByRole('combobox', { name: 'Template' }));
        fireEvent.click(screen.getByRole('option', { name: 'Pomodoro' }));
        fireEvent.click(screen.getByRole('button', { name: 'Start' }));

        expect(start).toHaveBeenCalledWith({ label: '', templateId: 'template-1' });
    });

    it('calls onClose when Cancel is clicked', () => {
        const onClose = renderSheet();

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onClose).toHaveBeenCalled();
    });
});
