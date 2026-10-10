import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { REORDER_BUSY_MESSAGE } from '@/lib/in-flight-entities';
import { toast } from 'sonner';
import { useSpaceListReorder } from './useSpaceListReorder';

const mocks = vi.hoisted(() => ({ reorderSpaces: vi.fn(), reorderLists: vi.fn() }));

vi.mock('@/actions/reorder-actions', () => ({
    reorderSpaces: (...args) => mocks.reorderSpaces(...args),
    reorderLists: (...args) => mocks.reorderLists(...args),
}));
vi.mock('sonner', () => ({
    toast: { loading: vi.fn(() => 'toast-id'), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));

const OWNED_SPACES = [
    { id: 'sp1', position: 0 },
    { id: 'sp2', position: 1 },
];
const LISTS = [
    { id: 'l1', position: 0, space_id: 'sp1' },
    { id: 'l2', position: 1, space_id: 'sp1' },
    { id: 'l3', position: 0, space_id: 'sp2' },
    { id: 'l4', position: 1, space_id: 'sp2' },
];

function renderSpaceListReorder() {
    const queryClient = new QueryClient();
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries').mockResolvedValue();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result: hookResult } = renderHook(() => useSpaceListReorder(OWNED_SPACES, LISTS), {
        wrapper,
    });
    return { hookResult, cancelQueries, invalidateQueries };
}

function drag(type, activeId, overId, extraData = {}) {
    return {
        active: { id: activeId, data: { current: { type, ...extraData } } },
        over: { id: overId },
    };
}

describe('useSpaceListReorder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.reorderSpaces.mockResolvedValue({ error: null });
        mocks.reorderLists.mockResolvedValue({ error: null });
    });

    it('a space drag saves spaces and never touches the lists cache or list saves', async () => {
        const { hookResult, cancelQueries, invalidateQueries } = renderSpaceListReorder();

        await act(() => hookResult.current.handleDragEnd(drag('space', 'sp1', 'sp2')));

        expect(mocks.reorderSpaces).toHaveBeenCalledTimes(1);
        expect(mocks.reorderLists).not.toHaveBeenCalled();
        expect(cancelQueries).toHaveBeenCalledWith({ queryKey: ['spaces'] });
        expect(cancelQueries).not.toHaveBeenCalledWith({ queryKey: ['lists'] });
        expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['lists'] });
    });

    it('a list drag saves only the lists of that space and never touches the spaces cache', async () => {
        const { hookResult, cancelQueries, invalidateQueries } = renderSpaceListReorder();

        await act(() =>
            hookResult.current.handleDragEnd(drag('list', 'l3', 'l4', { spaceId: 'sp2' })),
        );

        expect(mocks.reorderLists).toHaveBeenCalledTimes(1);
        expect(mocks.reorderLists).toHaveBeenCalledWith('sp2', ['l4', 'l3']);
        expect(mocks.reorderSpaces).not.toHaveBeenCalled();
        expect(cancelQueries).toHaveBeenCalledWith({ queryKey: ['lists'] });
        expect(cancelQueries).not.toHaveBeenCalledWith({ queryKey: ['spaces'] });
        expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['spaces'] });
    });

    it('Move up and Move down use the same save path as a drag', async () => {
        const { hookResult } = renderSpaceListReorder();

        await act(() => hookResult.current.moveListNextTo(LISTS[1], 'l1'));
        await act(() => hookResult.current.moveSpaceNextTo('sp2', 'sp1'));

        expect(mocks.reorderLists).toHaveBeenCalledWith('sp1', ['l2', 'l1']);
        expect(mocks.reorderSpaces).toHaveBeenCalledWith(['sp2', 'sp1']);
    });

    it('ignores a drop onto nothing, onto itself, or of an unknown kind', async () => {
        const { hookResult, cancelQueries } = renderSpaceListReorder();

        await act(() =>
            hookResult.current.handleDragEnd({ ...drag('space', 'sp1', 'sp2'), over: null }),
        );
        await act(() => hookResult.current.handleDragEnd(drag('space', 'sp1', 'sp1')));
        await act(() => hookResult.current.handleDragEnd(drag('task', 'x', 'y')));

        expect(cancelQueries).not.toHaveBeenCalled();
        expect(mocks.reorderSpaces).not.toHaveBeenCalled();
    });

    it('lets a space save and a list save of another space run at once, but turns a repeat away', async () => {
        let finishSpaceSave;
        mocks.reorderSpaces.mockReturnValue(new Promise((resolve) => (finishSpaceSave = resolve)));
        const { hookResult } = renderSpaceListReorder();

        let firstSpaceReorder;
        act(() => {
            firstSpaceReorder = hookResult.current.moveSpaceNextTo('sp1', 'sp2');
        });
        await vi.waitFor(() => expect(mocks.reorderSpaces).toHaveBeenCalledTimes(1));
        await act(() => hookResult.current.moveListNextTo(LISTS[0], 'l2'));
        await act(() => hookResult.current.moveSpaceNextTo('sp2', 'sp1'));

        expect(mocks.reorderLists).toHaveBeenCalledTimes(1);
        expect(toast.info).toHaveBeenCalledWith(REORDER_BUSY_MESSAGE);
        expect(mocks.reorderSpaces).toHaveBeenCalledTimes(1);
        await act(async () => {
            finishSpaceSave({ error: null });
            await firstSpaceReorder;
        });
    });
});
