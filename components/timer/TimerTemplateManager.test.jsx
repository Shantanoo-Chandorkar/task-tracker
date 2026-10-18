import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TimerTemplateManager from './TimerTemplateManager';

const templatesData = vi.hoisted(() => ({
    data: [
        {
            id: 'template-1',
            name: 'Pomodoro',
            blocks: [
                { kind: 'work', label: 'Focus', durationSeconds: 1500 },
                { kind: 'break', label: 'Break', durationSeconds: 300 },
            ],
        },
    ],
    isLoading: false,
}));
const createTimerTemplate = vi.fn();
const updateTimerTemplate = vi.fn();
const deleteTimerTemplate = vi.fn();
const duplicateTimerTemplate = vi.fn();

vi.mock('@/hooks/useTimerTemplatesQuery', () => ({
    useTimerTemplatesQuery: () => templatesData,
}));
vi.mock('@/modules/timer/actions/timer-template-actions', () => ({
    createTimerTemplate: (...args) => createTimerTemplate(...args),
    updateTimerTemplate: (...args) => updateTimerTemplate(...args),
    deleteTimerTemplate: (...args) => deleteTimerTemplate(...args),
    duplicateTimerTemplate: (...args) => duplicateTimerTemplate(...args),
}));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('sonner', () => ({
    toast: { loading: () => 'toast-id', success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

function renderManager() {
    const queryClient = new QueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            <TimerTemplateManager />
        </QueryClientProvider>,
    );
}

function openRowMenu(templateName) {
    fireEvent.pointerDown(
        screen.getByRole('button', { name: `More actions for ${templateName}` }),
        { button: 0, ctrlKey: false },
    );
}

beforeEach(() => {
    templatesData.data = [
        {
            id: 'template-1',
            name: 'Pomodoro',
            blocks: [
                { kind: 'work', label: 'Focus', durationSeconds: 1500 },
                { kind: 'break', label: 'Break', durationSeconds: 300 },
            ],
        },
    ];
    templatesData.isLoading = false;
});

describe('TimerTemplateManager', () => {
    it('shows the heading and every template', () => {
        renderManager();

        expect(screen.getByRole('heading', { name: 'Templates' })).toBeTruthy();
        expect(screen.getByText('Pomodoro')).toBeTruthy();
        expect(screen.getByText('2 blocks')).toBeTruthy();
    });

    it('shows the loading state, or the empty message, instead of a list', () => {
        templatesData.isLoading = true;
        const { unmount } = renderManager();
        expect(screen.getByText('Loading templates...')).toBeTruthy();
        unmount();

        templatesData.isLoading = false;
        templatesData.data = [];
        renderManager();
        expect(screen.getByText('No templates yet.')).toBeTruthy();
    });

    it('opens the create dialog with the Pomodoro preset available', () => {
        templatesData.data = [];
        renderManager();

        fireEvent.click(screen.getByRole('button', { name: '+ Add template' }));
        expect(screen.getByRole('dialog', { name: 'New template' })).toBeTruthy();

        fireEvent.click(screen.getByText('Use Pomodoro preset'));
        expect(screen.getByDisplayValue('Pomodoro')).toBeTruthy();
        expect(screen.getAllByLabelText(/^Block \d+ label$/)).toHaveLength(8);
    });

    it('opens the edit dialog for an existing template, prefilled', async () => {
        renderManager();

        openRowMenu('Pomodoro');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));

        expect(screen.getByRole('dialog', { name: 'Edit template' })).toBeTruthy();
        expect(screen.getByDisplayValue('Pomodoro')).toBeTruthy();
        expect(screen.getByDisplayValue('Focus')).toBeTruthy();
    });

    it('creates a template and closes the dialog on success', async () => {
        templatesData.data = [];
        createTimerTemplate.mockResolvedValue({
            data: {
                id: 'template-new',
                name: 'Deep work',
                blocks: [{ kind: 'work', label: 'Focus', durationSeconds: 1500 }],
            },
            error: null,
        });
        renderManager();

        fireEvent.click(screen.getByRole('button', { name: '+ Add template' }));
        fireEvent.change(screen.getByLabelText('Template name'), {
            target: { value: 'Deep work' },
        });
        fireEvent.click(screen.getByText('+ Add block'));

        await act(async () => {
            fireEvent.click(screen.getByText('Create template'));
        });

        await waitFor(() => expect(createTimerTemplate).toHaveBeenCalled());
        expect(screen.queryByRole('dialog', { name: 'New template' })).toBeNull();
    });

    it('duplicates a template from its row menu', async () => {
        duplicateTimerTemplate.mockResolvedValue({ data: { id: 'template-copy' }, error: null });
        renderManager();

        openRowMenu('Pomodoro');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));

        await waitFor(() =>
            expect(duplicateTimerTemplate).toHaveBeenCalledWith('template-1', expect.any(String)),
        );
    });

    it('deletes only after the confirm, warning that sessions keep their history', async () => {
        deleteTimerTemplate.mockResolvedValue({ error: null });
        renderManager();

        openRowMenu('Pomodoro');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        expect(
            screen.getByText(
                'Sessions that used this template keep their history and lose the link.',
            ),
        ).toBeTruthy();
        expect(deleteTimerTemplate).not.toHaveBeenCalled();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        });

        await waitFor(() => expect(deleteTimerTemplate).toHaveBeenCalledWith('template-1'));
    });

    it('keeps the popup open and shows the message when the delete is refused', async () => {
        deleteTimerTemplate.mockResolvedValue({ error: 'Not allowed' });
        renderManager();

        openRowMenu('Pomodoro');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        });

        expect(await screen.findByText('Not allowed')).toBeTruthy();
    });
});
