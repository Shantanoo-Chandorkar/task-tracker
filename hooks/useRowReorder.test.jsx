import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import { useRowReorder } from './useRowReorder';

vi.mock('sonner', () => ({
    toast: { loading: vi.fn(() => 'toast-id'), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));

const QUERY_KEY = ['lists'];
const GROUP = [
    { id: 'a', position: 0, space_id: 's1' },
    { id: 'b', position: 1, space_id: 's1' },
];
const OTHER = { id: 'x', position: 0, space_id: 's2' };

function renderRowReorder() {
    const queryClient = new QueryClient();
    queryClient.setQueryData(QUERY_KEY, [OTHER, ...GROUP]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return { queryClient, ...renderHook(() => useRowReorder(), { wrapper }) };
}

function reorderOptions(overrides = {}) {
    return {
        groupRows: GROUP,
        activeId: 'a',
        overId: 'b',
        queryKey: QUERY_KEY,
        scopeKey: 'lists:s1',
        saveOrder: vi.fn().mockResolvedValue(null),
        bustCache: { urls: ['/spaces'] },
        failureMessage: 'Could not reach the server. Try again.',
        ...overrides,
    };
}

describe('useRowReorder', () => {
    beforeEach(() => vi.clearAllMocks());

    it('saves the group in its new order and shows it in the cache in place', async () => {
        const { result: hookResult, queryClient } = renderRowReorder();
        const options = reorderOptions();

        await act(() => hookResult.current(options));

        expect(options.saveOrder).toHaveBeenCalledWith([GROUP[1], GROUP[0]]);
        expect(queryClient.getQueryData(QUERY_KEY).map((row) => row.id)).toEqual(['x', 'b', 'a']);
    });

    it('confirms with the default text, or with the text the caller gives', async () => {
        const { result: hookResult } = renderRowReorder();

        await act(() => hookResult.current(reorderOptions()));
        await act(() => hookResult.current(reorderOptions({ successMessage: 'Order saved' })));

        expect(toast.success).toHaveBeenNthCalledWith(1, 'Order updated', { id: 'toast-id' });
        expect(toast.success).toHaveBeenNthCalledWith(2, 'Order saved', { id: 'toast-id' });
        expect(bustPageCache).toHaveBeenCalledWith({ urls: ['/spaces'] });
    });

    it('shows a refusal from the save and reloads', async () => {
        const { result: hookResult, queryClient } = renderRowReorder();
        const options = reorderOptions({ saveOrder: vi.fn().mockResolvedValue('Not allowed') });

        await act(() => hookResult.current(options));

        expect(toast.error).toHaveBeenCalledWith('Not allowed', { id: 'toast-id' });
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: QUERY_KEY });
    });

    it('shows the failure message when the save throws', async () => {
        const { result: hookResult } = renderRowReorder();
        const options = reorderOptions({
            saveOrder: vi.fn().mockRejectedValue(new Error('offline')),
        });

        await act(() => hookResult.current(options));

        expect(toast.error).toHaveBeenCalledWith('Could not reach the server. Try again.', {
            id: 'toast-id',
        });
    });

    it('does nothing at all when the dragged row is no longer in the group', async () => {
        const { result: hookResult, queryClient } = renderRowReorder();
        const options = reorderOptions({ activeId: 'gone' });

        await act(() => hookResult.current(options));

        expect(options.saveOrder).not.toHaveBeenCalled();
        expect(toast.loading).not.toHaveBeenCalled();
        expect(queryClient.getQueryData(QUERY_KEY).map((row) => row.id)).toEqual(['x', 'a', 'b']);
    });
});
