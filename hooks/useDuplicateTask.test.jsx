import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDuplicateTask } from './useDuplicateTask';

const duplicateTask = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('@/actions/task-actions', () => ({ duplicateTask: (...args) => duplicateTask(...args) }));
vi.mock('@/lib/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('sonner', () => ({
    toast: {
        loading: () => 'toast-id',
        error: (...args) => toastError(...args),
        success: (...args) => toastSuccess(...args),
    },
}));

function renderDuplicateHook() {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result: duplicateHook } = renderHook(() => useDuplicateTask('list-1'), { wrapper });
    return { duplicateHook, invalidateQueries };
}

describe('useDuplicateTask', () => {
    beforeEach(() => vi.clearAllMocks());

    it('duplicates, refreshes the list and its counts, and confirms with a toast', async () => {
        duplicateTask.mockResolvedValue({ error: null });
        const { duplicateHook, invalidateQueries } = renderDuplicateHook();

        await act(() => duplicateHook.current.duplicateTaskById('task-1'));

        expect(duplicateTask).toHaveBeenCalledWith('task-1');
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tasks', 'list-1'] });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['lists'] });
        expect(toastSuccess).toHaveBeenCalledWith('Task duplicated', { id: 'toast-id' });
    });

    it('ignores a repeat for the same task while the first copy is in flight', async () => {
        let finishDuplicate;
        duplicateTask.mockReturnValue(new Promise((resolve) => (finishDuplicate = resolve)));
        const { duplicateHook } = renderDuplicateHook();

        let firstCall;
        act(() => {
            firstCall = duplicateHook.current.duplicateTaskById('task-1');
            duplicateHook.current.duplicateTaskById('task-1');
        });
        expect(duplicateTask).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishDuplicate({ error: null });
            await firstCall;
        });
    });

    it('ignores a repeat coming from a different hook instance, like menu then shortcut', async () => {
        let finishDuplicate;
        duplicateTask.mockReturnValue(new Promise((resolve) => (finishDuplicate = resolve)));
        const { duplicateHook: menuHook } = renderDuplicateHook();
        const { duplicateHook: shortcutHook } = renderDuplicateHook();

        let firstCall;
        act(() => {
            firstCall = menuHook.current.duplicateTaskById('task-1');
            shortcutHook.current.duplicateTaskById('task-1');
        });
        expect(duplicateTask).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishDuplicate({ error: null });
            await firstCall;
        });
    });

    it('shows the server error and refreshes nothing', async () => {
        duplicateTask.mockResolvedValue({ error: 'Task limit reached' });
        const { duplicateHook, invalidateQueries } = renderDuplicateHook();

        await act(() => duplicateHook.current.duplicateTaskById('task-1'));

        expect(toastError).toHaveBeenCalledWith('Task limit reached', { id: 'toast-id' });
        expect(invalidateQueries).not.toHaveBeenCalled();
    });

    it('reports a rejected action and allows trying again afterwards', async () => {
        duplicateTask.mockRejectedValueOnce(new Error('offline'));
        const { duplicateHook } = renderDuplicateHook();

        await act(() => duplicateHook.current.duplicateTaskById('task-1'));
        expect(toastError).toHaveBeenCalledWith(
            expect.stringContaining('Could not reach the server'),
            { id: 'toast-id' },
        );

        duplicateTask.mockResolvedValue({ error: null });
        await act(() => duplicateHook.current.duplicateTaskById('task-1'));
        expect(duplicateTask).toHaveBeenCalledTimes(2);
    });
});
