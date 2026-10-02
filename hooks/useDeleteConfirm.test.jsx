import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDeleteConfirm } from './useDeleteConfirm';

const fetchDeleteCounts = vi.fn();

vi.mock('@/lib/fetch-delete-counts', () => ({
    fetchDeleteCounts: (...args) => fetchDeleteCounts(...args),
}));

// A fresh id per test, because the in-flight guard is module-level and a pending fetch would hold it
let nextListNumber = 0;
let listTarget;
let listRefresh;

describe('useDeleteConfirm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const listId = `list-${nextListNumber++}`;
        listTarget = { id: listId, name: 'Groceries', counts: { tasks: 3 } };
        listRefresh = {
            countsUrl: `/api/lists/${listId}`,
            withFreshCounts: (target, fetched) => ({
                ...target,
                counts: { tasks: fetched.task_count },
            }),
        };
    });

    it('opens with the cached counts before the counts request finishes', () => {
        fetchDeleteCounts.mockReturnValue(new Promise(() => {}));
        const { result } = renderHook(() => useDeleteConfirm());

        act(() => result.current.requestDelete(listTarget, listRefresh));

        expect(result.current.deleteTarget).toEqual(listTarget);
    });

    it('replaces the cached counts with the fetched ones while the dialog is still open', async () => {
        fetchDeleteCounts.mockResolvedValue({ task_count: 5 });
        const { result } = renderHook(() => useDeleteConfirm());

        await act(async () => result.current.requestDelete(listTarget, listRefresh));

        expect(result.current.deleteTarget.counts).toEqual({ tasks: 5 });
    });

    it('does not reopen or change a dialog that was closed before the counts arrived', async () => {
        let finishFetch;
        fetchDeleteCounts.mockReturnValue(new Promise((resolve) => (finishFetch = resolve)));
        const { result } = renderHook(() => useDeleteConfirm());

        act(() => result.current.requestDelete(listTarget, listRefresh));
        act(() => result.current.setDeleteTarget(null));
        await act(async () => finishFetch({ task_count: 5 }));

        expect(result.current.deleteTarget).toBeNull();
    });

    it('starts one counts request however often the button is pressed', () => {
        fetchDeleteCounts.mockReturnValue(new Promise(() => {}));
        const { result } = renderHook(() => useDeleteConfirm());

        act(() => {
            result.current.requestDelete(listTarget, listRefresh);
            result.current.requestDelete(listTarget, listRefresh);
            result.current.requestDelete(listTarget, listRefresh);
        });

        expect(fetchDeleteCounts).toHaveBeenCalledTimes(1);
    });

    it('keeps the cached counts when the counts request fails', async () => {
        fetchDeleteCounts.mockRejectedValue(new TypeError('offline'));
        const { result } = renderHook(() => useDeleteConfirm());

        await act(async () => result.current.requestDelete(listTarget, listRefresh));

        expect(result.current.deleteTarget).toEqual(listTarget);
    });

    it('opens without any request when no refresh is given', () => {
        const { result } = renderHook(() => useDeleteConfirm());

        act(() => result.current.requestDelete({ id: 'space-1', name: 'Home', counts: null }));

        expect(fetchDeleteCounts).not.toHaveBeenCalled();
        expect(result.current.deleteTarget.id).toBe('space-1');
    });
});
