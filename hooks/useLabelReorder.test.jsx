import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import { useLabelReorder } from './useLabelReorder';

vi.mock('sonner', () => ({
    toast: { loading: vi.fn(() => 'toast-id'), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));

const LABELS = [
    { id: 'a', name: 'A', position: 0 },
    { id: 'b', name: 'B', position: 1 },
    { id: 'c', name: 'C', position: 2 },
];

function renderLabelReorder(resourceKey, saveOrder) {
    const queryClient = new QueryClient();
    queryClient.setQueryData([resourceKey, 'space-1'], LABELS);
    queryClient.setQueryData(['other', 'space-1'], LABELS);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const rendered = renderHook(
        () => useLabelReorder({ resourceKey, spaceId: 'space-1', labels: LABELS, saveOrder }),
        { wrapper },
    );
    return { queryClient, ...rendered };
}

describe('useLabelReorder', () => {
    beforeEach(() => vi.clearAllMocks());

    it('saves the ids in the new order for the space and shows it in that cache only', async () => {
        const saveOrder = vi.fn().mockResolvedValue({ error: null });
        const { result: hookResult, queryClient } = renderLabelReorder('tags', saveOrder);

        await act(() => hookResult.current.moveLabelNextTo('c', 'a'));

        expect(saveOrder).toHaveBeenCalledWith('space-1', ['c', 'a', 'b']);
        expect(queryClient.getQueryData(['tags', 'space-1']).map((row) => row.id)).toEqual([
            'c',
            'a',
            'b',
        ]);
        expect(queryClient.getQueryData(['other', 'space-1'])).toBe(LABELS);
        expect(toast.success).toHaveBeenCalledWith('Order saved', { id: 'toast-id' });
        expect(bustPageCache).toHaveBeenCalledWith({ prefixes: ['/lists/'] });
    });

    it('turns a drop on another row into a move, and ignores a drop on itself or on nothing', async () => {
        const saveOrder = vi.fn().mockResolvedValue({ error: null });
        const { result: hookResult } = renderLabelReorder('statuses', saveOrder);

        await act(() => hookResult.current.handleDragEnd({ active: { id: 'a' }, over: null }));
        await act(() =>
            hookResult.current.handleDragEnd({ active: { id: 'a' }, over: { id: 'a' } }),
        );
        expect(saveOrder).not.toHaveBeenCalled();

        await act(() =>
            hookResult.current.handleDragEnd({ active: { id: 'a' }, over: { id: 'b' } }),
        );
        expect(saveOrder).toHaveBeenCalledWith('space-1', ['b', 'a', 'c']);
    });

    it('shows the first refusal and does not confirm', async () => {
        const saveOrder = vi.fn().mockResolvedValue({ error: 'Not allowed' });
        const { result: hookResult } = renderLabelReorder('tags', saveOrder);

        await act(() => hookResult.current.moveLabelNextTo('a', 'b'));

        expect(toast.error).toHaveBeenCalledWith('Not allowed', { id: 'toast-id' });
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('does nothing when a neighbour is not in the list', async () => {
        const saveOrder = vi.fn();
        const { result: hookResult } = renderLabelReorder('tags', saveOrder);

        await act(() => hookResult.current.moveLabelNextTo('a', 'missing'));

        expect(saveOrder).not.toHaveBeenCalled();
    });
});
