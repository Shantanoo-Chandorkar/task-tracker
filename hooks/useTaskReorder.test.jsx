import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTaskReorder } from './useTaskReorder';

vi.mock('sonner', () => ({
    toast: { loading: () => 'toast-id', success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));

function task(id, overrides = {}) {
    return { id, parent_id: null, sublist_id: null, is_prioritised: false, ...overrides };
}

function renderTaskReorder(initialTasks, listId) {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const rendered = renderHook(({ flatList }) => useTaskReorder(listId, flatList), {
        wrapper,
        initialProps: { flatList: initialTasks },
    });
    return { ...rendered, queryClient };
}

function movedTaskIds() {
    return globalThis.fetch.mock.calls.map(([url]) => url);
}

describe('useTaskReorder', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async () => ({ ok: true }));
    });
    afterEach(() => vi.restoreAllMocks());

    it('saves a drop through the move route and puts the optimistic order in the cache', async () => {
        const { result, queryClient } = renderTaskReorder(
            [task('a'), task('b'), task('c')],
            'list-save',
        );

        await act(() =>
            result.current.handleTaskDragEnd({ active: { id: 'c' }, over: { id: 'a' } }),
        );

        expect(movedTaskIds()).toEqual(['/api/tasks/c/move']);
        expect(
            queryClient.getQueryData(['tasks', 'list-save']).map((cachedTask) => cachedTask.id),
        ).toEqual(['c', 'a', 'b']);
    });

    it('does nothing for a drop the plan rejects', async () => {
        const { result } = renderTaskReorder([task('a'), task('b')], 'list-ignore');

        await act(() =>
            result.current.handleTaskDragEnd({ active: { id: 'a' }, over: { id: 'missing' } }),
        );

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('keeps one onMoveTask identity across renders, so memoized rows are not re-rendered by it', () => {
        const { result, rerender } = renderTaskReorder([task('a'), task('b')], 'list-stable');
        const firstIdentity = result.current.onMoveTask;

        rerender({ flatList: [task('a'), task('b'), task('c')] });

        expect(result.current.onMoveTask).toBe(firstIdentity);
    });

    it('moves against the newest task list even through the old onMoveTask', async () => {
        const { result, rerender, queryClient } = renderTaskReorder(
            [task('a'), task('b')],
            'list-latest',
        );
        const oldOnMoveTask = result.current.onMoveTask;

        rerender({ flatList: [task('a'), task('b'), task('c')] });
        await act(() => oldOnMoveTask('c', 'a'));

        expect(
            queryClient.getQueryData(['tasks', 'list-latest']).map((cachedTask) => cachedTask.id),
        ).toEqual(['c', 'a', 'b']);
    });
});
