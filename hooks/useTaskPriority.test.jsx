import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTaskPriority } from './useTaskPriority';

const updateTask = vi.fn();
const toastError = vi.fn();

vi.mock('@/actions/task-update-actions', () => ({ updateTask: (...args) => updateTask(...args) }));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: (...args) => toastError(...args) } }));

function renderPriorityHook(queryClient) {
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => useTaskPriority('list-1'), { wrapper }).result;
}

describe('useTaskPriority', () => {
    beforeEach(() => vi.clearAllMocks());

    it('sends one update when the row star and the row menu are used at the same moment', async () => {
        let finishUpdate;
        updateTask.mockReturnValue(new Promise((resolve) => (finishUpdate = resolve)));
        const queryClient = new QueryClient();
        const starHook = renderPriorityHook(queryClient);
        const menuHook = renderPriorityHook(queryClient);
        const task = { id: 'task-priority-1', is_prioritised: false };

        let firstCall;
        act(() => {
            firstCall = starHook.current.togglePriority(task);
            menuHook.current.togglePriority(task);
        });
        expect(updateTask).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishUpdate({ error: null });
            await firstCall;
        });
    });

    it('puts the flag back and shows the error when the server refuses', async () => {
        updateTask.mockResolvedValue({ error: 'Priority limit reached' });
        const queryClient = new QueryClient();
        queryClient.setQueryData(
            ['tasks', 'list-1'],
            [{ id: 'task-priority-2', is_prioritised: false }],
        );
        const priorityHook = renderPriorityHook(queryClient);

        await act(() =>
            priorityHook.current.togglePriority({ id: 'task-priority-2', is_prioritised: false }),
        );

        expect(queryClient.getQueryData(['tasks', 'list-1'])[0].is_prioritised).toBe(false);
        expect(toastError).toHaveBeenCalledWith('Priority limit reached');
    });
});
