import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TaskFormDialog, { scheduleEditorPrefetch } from './TaskFormDialog';

const createTaskWithTags = vi.fn();
const updateTask = vi.fn();
// Counts up so each "new id" is visibly different; `unavailable` mimics a browser without crypto.randomUUID
const clientIds = vi.hoisted(() => ({ counter: 0, unavailable: false }));

vi.mock('@/lib/client-id', () => ({
    createClientId: () => (clientIds.unavailable ? undefined : `client-id-${++clientIds.counter}`),
}));
vi.mock('@/actions/task-create-actions', () => ({
    createTaskWithTags: (...args) => createTaskWithTags(...args),
}));
vi.mock('@/actions/task-update-actions', () => ({
    updateTask: (...args) => updateTask(...args),
}));
const editorLoadTracker = vi.hoisted(() => ({ loadCount: 0 }));

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/custom/RichTextEditor', () => {
    editorLoadTracker.loadCount += 1;
    return { default: () => null };
});
vi.mock('@/hooks/useStatusesQuery', () => ({ useStatusesQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useSublistsQuery', () => ({ useSublistsQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useSpaceIdForList', () => ({ useSpaceIdForList: () => 'space-1' }));
vi.mock('@/hooks/useSpaceById', () => ({ useSpaceById: () => ({ require_due_date: false }) }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('./RecurrenceBuilder', () => ({ default: () => null }));
vi.mock('./StagedTagPicker', () => ({ default: () => null }));
vi.mock('@/components/task-detail/TaskTagPicker', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

function renderCreateDialog(openState = true) {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const dialog = (isOpen) => (
        <QueryClientProvider client={queryClient}>
            <TaskFormDialog open={isOpen} onClose={vi.fn()} listId="list-1" />
        </QueryClientProvider>
    );
    const rendered = render(dialog(openState));
    return { setOpen: (isOpen) => rendered.rerender(dialog(isOpen)) };
}

async function submitTitle(title) {
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: title } });
    await act(async () => {
        fireEvent.submit(document.querySelector('form'));
    });
}

describe('TaskFormDialog client-made id for create', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clientIds.counter = 0;
        clientIds.unavailable = false;
    });

    it('sends the same id when the user retries after a lost reply', async () => {
        createTaskWithTags
            .mockRejectedValueOnce(new Error('response lost'))
            .mockResolvedValue({ data: { id: 'client-id-1' }, error: null });
        renderCreateDialog();

        await submitTitle('Buy milk');
        await submitTitle('Buy milk');

        expect(createTaskWithTags).toHaveBeenCalledTimes(2);
        expect(createTaskWithTags.mock.calls[0][0].id).toBeDefined();
        expect(createTaskWithTags.mock.calls[1][0].id).toBe(createTaskWithTags.mock.calls[0][0].id);
    });

    it('makes a new id each time the dialog is opened', async () => {
        createTaskWithTags.mockResolvedValue({ data: { id: 'x' }, error: null });
        const { setOpen } = renderCreateDialog();
        await submitTitle('First');

        setOpen(false);
        setOpen(true);
        await submitTitle('Second');

        expect(createTaskWithTags.mock.calls[1][0].id).not.toBe(
            createTaskWithTags.mock.calls[0][0].id,
        );
    });

    it('sends no id when the browser cannot make one, leaving it to the server', async () => {
        clientIds.unavailable = true;
        createTaskWithTags.mockResolvedValue({ data: { id: 'x' }, error: null });
        renderCreateDialog();

        await submitTitle('Buy milk');

        expect(createTaskWithTags.mock.calls[0][0]).not.toHaveProperty('id');
    });
});

describe('TaskFormDialog first mounted already open', () => {
    it('fills the title from the task being edited, as row dialogs now mount on first open', () => {
        render(
            <QueryClientProvider client={new QueryClient()}>
                <TaskFormDialog
                    open
                    onClose={vi.fn()}
                    task={{ id: 't1', title: 'Existing title', list_id: 'list-1', status_id: 's1' }}
                />
            </QueryClientProvider>,
        );

        expect(screen.getByPlaceholderText('Task title').value).toBe('Existing title');
    });
});

describe('scheduleEditorPrefetch', () => {
    afterEach(() => {
        delete window.requestIdleCallback;
        delete window.cancelIdleCallback;
        Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
        vi.restoreAllMocks();
    });

    it('loads the editor only when the browser goes idle', async () => {
        let runWhenIdle;
        window.requestIdleCallback = vi.fn((callback) => {
            runWhenIdle = callback;
            return 7;
        });
        window.cancelIdleCallback = vi.fn();
        const loadsBefore = editorLoadTracker.loadCount;

        scheduleEditorPrefetch();
        expect(window.requestIdleCallback).toHaveBeenCalledTimes(1);
        expect(editorLoadTracker.loadCount).toBe(loadsBefore);

        await runWhenIdle();
        expect(editorLoadTracker.loadCount).toBe(loadsBefore + 1);
    });

    it('cancels the pending idle callback when its cleanup runs', () => {
        window.requestIdleCallback = vi.fn(() => 7);
        window.cancelIdleCallback = vi.fn();

        const cancelPrefetch = scheduleEditorPrefetch();
        cancelPrefetch();

        expect(window.cancelIdleCallback).toHaveBeenCalledWith(7);
    });

    it('does nothing when Data Saver is on', () => {
        window.requestIdleCallback = vi.fn();
        Object.defineProperty(navigator, 'connection', {
            value: { saveData: true },
            configurable: true,
        });

        scheduleEditorPrefetch();

        expect(window.requestIdleCallback).not.toHaveBeenCalled();
    });

    it('falls back to a two second timer where requestIdleCallback does not exist, as in Safari', () => {
        const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
        const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

        const cancelPrefetch = scheduleEditorPrefetch();
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

        cancelPrefetch();
        expect(clearTimeoutSpy).toHaveBeenCalled();
    });
});
