import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTaskCompletion } from './useTaskCompletion';

const updateTask = vi.fn();
const completeTaskAndDescendants = vi.fn();

vi.mock('@/actions/task-actions', () => ({
    updateTask: (...args) => updateTask(...args),
    completeTaskAndDescendants: (...args) => completeTaskAndDescendants(...args),
    uncompleteTaskAndDescendants: vi.fn(),
}));
vi.mock('@/lib/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('@/hooks/useSpaceIdForList', () => ({ useSpaceIdForList: () => 'space-1' }));
vi.mock('@/hooks/useStatusesQuery', () => ({
    useStatusesQuery: () => ({
        data: [
            { id: 'todo', is_default: true },
            { id: 'done', code: 'done' },
        ],
    }),
}));
vi.mock('sonner', () => ({
    toast: {
        loading: () => 'toast-id',
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        dismiss: vi.fn(),
    },
}));

function renderCompletionHook() {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => useTaskCompletion('list-1'), { wrapper }).result;
}

describe('useTaskCompletion', () => {
    beforeEach(() => vi.clearAllMocks());

    it('sends one update when two instances complete the same task at once', async () => {
        let finishUpdate;
        updateTask.mockReturnValue(new Promise((resolve) => (finishUpdate = resolve)));
        const rowHook = renderCompletionHook();
        const pickerHook = renderCompletionHook();
        const task = { id: 'task-1', status_id: 'todo' };

        let firstCall;
        act(() => {
            firstCall = rowHook.current.setComplete(task, [task], 'list-1', true);
            pickerHook.current.setComplete(task, [task], 'list-1', true);
        });
        expect(updateTask).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishUpdate({ error: null });
            await firstCall;
        });

        updateTask.mockResolvedValue({ error: null });
        await act(() => rowHook.current.setComplete(task, [task], 'list-1', true));
        expect(updateTask).toHaveBeenCalledTimes(2);
    });

    it('keeps the cascade popup open until the tasks have reloaded, then closes it', async () => {
        let finishCascade;
        completeTaskAndDescendants.mockReturnValue(
            new Promise((resolve) => (finishCascade = resolve)),
        );
        const completionHook = renderCompletionHook();
        const parentTask = { id: 'task-cascade', status_id: 'todo', parent_id: null };
        const childTask = { id: 'child-1', status_id: 'todo', parent_id: 'task-cascade' };

        await act(() =>
            completionHook.current.setComplete(parentTask, [parentTask, childTask], 'list-1', true),
        );
        expect(completionHook.current.completeDialogProps.open).toBe(true);

        let confirming;
        act(() => {
            confirming = completionHook.current.completeDialogProps.onConfirm();
        });
        expect(completionHook.current.completeDialogProps.isPending).toBe(true);
        expect(completionHook.current.completeDialogProps.open).toBe(true);

        await act(async () => {
            finishCascade({ error: null, completedCount: 2, totalCount: 2 });
            await confirming;
        });
        expect(completionHook.current.completeDialogProps.open).toBe(false);
    });

    it('keeps the cascade popup open with the error when the server refuses', async () => {
        completeTaskAndDescendants.mockResolvedValue({ error: 'You cannot complete these' });
        const completionHook = renderCompletionHook();
        const parentTask = { id: 'task-cascade-2', status_id: 'todo', parent_id: null };
        const childTask = { id: 'child-2', status_id: 'todo', parent_id: 'task-cascade-2' };
        await act(() =>
            completionHook.current.setComplete(parentTask, [parentTask, childTask], 'list-1', true),
        );

        await act(async () => {
            await completionHook.current.completeDialogProps.onConfirm();
        });

        expect(completionHook.current.completeDialogProps.open).toBe(true);
        expect(completionHook.current.completeDialogProps.errorMessage).toBe(
            'You cannot complete these',
        );
        expect(completionHook.current.completeDialogProps.isPending).toBe(false);
    });
});
