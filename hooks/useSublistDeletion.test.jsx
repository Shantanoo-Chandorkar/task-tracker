import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSublistDeletion } from './useSublistDeletion';

const mocks = vi.hoisted(() => ({
    deleteSublist: vi.fn(),
    fetchDeleteCounts: vi.fn(),
    bustPageCache: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: { loading: () => 'toast-id', success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));
vi.mock('@/actions/sublist-actions', () => ({ deleteSublist: mocks.deleteSublist }));
vi.mock('@/lib/fetch-delete-counts', () => ({ fetchDeleteCounts: mocks.fetchDeleteCounts }));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: mocks.bustPageCache }));

const sublist = { id: 'sublist-1', name: 'Sprint' };
const flatList = [
    { id: 't1', parent_id: null, sublist_id: 'sublist-1' },
    { id: 't2', parent_id: 't1', sublist_id: null },
    { id: 't3', parent_id: null, sublist_id: null },
];

function renderDeletion(listId) {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSublistDeletion(listId, flatList), { wrapper });
    return { result, queryClient };
}

describe('useSublistDeletion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.fetchDeleteCounts.mockResolvedValue(null);
    });
    afterEach(() => vi.restoreAllMocks());

    it('opens at once with the task count taken from the loaded tasks, subtasks included', () => {
        const { result } = renderDeletion('list-count');

        act(() => result.current.requestDelete(sublist));

        expect(result.current.deleteTarget).toEqual({
            id: 'sublist-1',
            name: 'Sprint',
            taskCount: 2,
        });
        expect(mocks.deleteSublist).not.toHaveBeenCalled();
    });

    it('swaps in the count the server reports a moment later', async () => {
        mocks.fetchDeleteCounts.mockResolvedValue({ task_count: 7 });
        const { result } = renderDeletion('list-fresh');

        act(() => result.current.requestDelete(sublist));

        await waitFor(() => expect(result.current.deleteTarget.taskCount).toBe(7));
        expect(mocks.fetchDeleteCounts).toHaveBeenCalledWith('/api/sublists/sublist-1');
    });

    it('closes without deleting', () => {
        const { result } = renderDeletion('list-close');
        act(() => result.current.requestDelete(sublist));

        act(() => result.current.closeDelete());

        expect(result.current.deleteTarget).toBeNull();
        expect(mocks.deleteSublist).not.toHaveBeenCalled();
    });

    it('does nothing on confirm when no sublist is open', () => {
        const { result } = renderDeletion('list-none');

        expect(result.current.confirmDelete()).toBeUndefined();
        expect(mocks.deleteSublist).not.toHaveBeenCalled();
    });

    it('deletes, reloads sublists, tasks and lists, clears the page cache, then closes', async () => {
        mocks.deleteSublist.mockResolvedValue({ error: null });
        const { result, queryClient } = renderDeletion('list-delete');
        act(() => result.current.requestDelete(sublist));

        await act(() => result.current.confirmDelete());

        expect(mocks.deleteSublist).toHaveBeenCalledWith('sublist-1');
        const reloadedKeys = queryClient.invalidateQueries.mock.calls.map(
            ([options]) => options.queryKey,
        );
        expect(reloadedKeys).toEqual(
            expect.arrayContaining([
                ['sublists', 'list-delete'],
                ['tasks', 'list-delete'],
                ['lists'],
            ]),
        );
        expect(mocks.bustPageCache).toHaveBeenCalledWith({ urls: ['/lists/list-delete'] });
        expect(result.current.deleteTarget).toBeNull();
    });

    it('stays open with the server message when the delete is refused', async () => {
        mocks.deleteSublist.mockResolvedValue({ error: 'Cannot delete' });
        const { result } = renderDeletion('list-refused');
        act(() => result.current.requestDelete(sublist));

        await act(() => result.current.confirmDelete());

        expect(result.current.deleteTarget).not.toBeNull();
        expect(result.current.errorMessage).toBe('Cannot delete');
        expect(result.current.isPending).toBe(false);
    });

    it('sends one delete when confirm is called twice before the first finishes', async () => {
        mocks.deleteSublist.mockReturnValue(new Promise(() => {}));
        const { result } = renderDeletion('list-twice');
        act(() => result.current.requestDelete(sublist));

        act(() => {
            result.current.confirmDelete();
            result.current.confirmDelete();
        });

        expect(mocks.deleteSublist).toHaveBeenCalledTimes(1);
    });
});
