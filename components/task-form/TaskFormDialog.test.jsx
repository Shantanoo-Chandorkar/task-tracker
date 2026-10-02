import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TaskFormDialog from './TaskFormDialog';

const createTaskWithTags = vi.fn();
const updateTask = vi.fn();
// Counts up so each "new id" is visibly different; `unavailable` mimics a browser without crypto.randomUUID
const clientIds = vi.hoisted(() => ({ counter: 0, unavailable: false }));

vi.mock('@/lib/client-id', () => ({
    createClientId: () => (clientIds.unavailable ? undefined : `client-id-${++clientIds.counter}`),
}));
vi.mock('@/actions/task-actions', () => ({
    createTaskWithTags: (...args) => createTaskWithTags(...args),
    updateTask: (...args) => updateTask(...args),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/hooks/useStatusesQuery', () => ({ useStatusesQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useSublistsQuery', () => ({ useSublistsQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useSpaceIdForList', () => ({ useSpaceIdForList: () => 'space-1' }));
vi.mock('@/hooks/useSpaceById', () => ({ useSpaceById: () => ({ require_due_date: false }) }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('@/lib/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
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
