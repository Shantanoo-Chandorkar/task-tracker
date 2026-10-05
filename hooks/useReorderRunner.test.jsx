import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { REORDER_BUSY_MESSAGE } from '@/lib/in-flight-entities';
import { useReorderRunner } from './useReorderRunner';

const mocks = vi.hoisted(() => ({ eventLog: [] }));

vi.mock('sonner', () => ({
    toast: {
        loading: (message) => {
            mocks.eventLog.push(`toast.loading:${message}`);
            return 'toast-id';
        },
        success: (message) => mocks.eventLog.push(`toast.success:${message}`),
        error: (message) => mocks.eventLog.push(`toast.error:${message}`),
        info: (message) => mocks.eventLog.push(`toast.info:${message}`),
    },
}));
vi.mock('@/lib/cache/service-worker-cache', () => ({
    bustPageCache: ({ urls = [], prefixes = [] }) =>
        mocks.eventLog.push(`bust:${[...urls, ...prefixes].join(',')}`),
}));

const QUERY_KEY = ['tasks', 'list-1'];

function renderRunner() {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'cancelQueries').mockImplementation(async () => {
        mocks.eventLog.push('cancel');
    });
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async () => {
        mocks.eventLog.push('invalidate');
    });
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => useReorderRunner(), { wrapper }).result;
}

function reorderWith(overrides = {}) {
    return {
        scopeKey: 'tasks:list-1',
        queryKey: QUERY_KEY,
        applyOptimistic: () => mocks.eventLog.push('optimistic'),
        save: async () => {
            mocks.eventLog.push('save');
            return null;
        },
        failureMessage: 'Failed to reorder task',
        bustCache: { urls: ['/lists/list-1'] },
        ...overrides,
    };
}

describe('useReorderRunner', () => {
    beforeEach(() => {
        mocks.eventLog.length = 0;
    });
    afterEach(() => vi.restoreAllMocks());

    it('stops reloads, shows the new order, saves it, refreshes and confirms, in that order', async () => {
        const hookResult = renderRunner();

        await act(() => hookResult.current(reorderWith()));

        expect(mocks.eventLog).toEqual([
            'cancel',
            'optimistic',
            'toast.loading:Saving order...',
            'save',
            'invalidate',
            'bust:/lists/list-1',
            'toast.success:Order updated',
        ]);
    });

    it('tells the user about a refusal first, then refreshes, and never confirms', async () => {
        const hookResult = renderRunner();

        await act(() => hookResult.current(reorderWith({ save: async () => 'Not allowed' })));

        expect(mocks.eventLog.slice(3)).toEqual([
            'toast.error:Not allowed',
            'invalidate',
            'bust:/lists/list-1',
        ]);
    });

    it('treats a throw as a lost connection: failure message, then refresh', async () => {
        const hookResult = renderRunner();
        const save = async () => {
            throw new Error('offline');
        };

        await act(() => hookResult.current(reorderWith({ save })));

        expect(mocks.eventLog.slice(3)).toEqual([
            'toast.error:Failed to reorder task',
            'invalidate',
            'bust:/lists/list-1',
        ]);
    });

    it('turns a second reorder in the same scope away with the busy message', async () => {
        const hookResult = renderRunner();
        let finishFirstSave;
        const slowSave = () =>
            new Promise((resolve) => {
                finishFirstSave = () => resolve(null);
            });
        const saveSpy = vi.fn(slowSave);

        let firstReorder;
        act(() => {
            firstReorder = hookResult.current(reorderWith({ save: saveSpy }));
        });
        await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
        await act(() => hookResult.current(reorderWith({ save: saveSpy })));

        expect(mocks.eventLog).toContain(`toast.info:${REORDER_BUSY_MESSAGE}`);
        expect(saveSpy).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishFirstSave();
            await firstReorder;
        });
    });

    it('lets two different scopes save at once', async () => {
        const hookResult = renderRunner();
        let finishTaskSave;
        const taskSave = vi.fn(
            () =>
                new Promise((resolve) => {
                    finishTaskSave = () => resolve(null);
                }),
        );
        const sublistSave = vi.fn(async () => null);

        let taskReorder;
        act(() => {
            taskReorder = hookResult.current(reorderWith({ save: taskSave }));
        });
        await vi.waitFor(() => expect(taskSave).toHaveBeenCalled());
        await act(() =>
            hookResult.current(reorderWith({ scopeKey: 'sublists:list-1', save: sublistSave })),
        );

        expect(sublistSave).toHaveBeenCalledTimes(1);
        await act(async () => {
            finishTaskSave();
            await taskReorder;
        });
    });

    it('is free again after a finished save, even a failed one', async () => {
        const hookResult = renderRunner();
        const save = vi.fn(async () => 'Not allowed');

        await act(() => hookResult.current(reorderWith({ save })));
        await act(() => hookResult.current(reorderWith({ save })));

        expect(save).toHaveBeenCalledTimes(2);
    });

    it('confirms with the success message the caller gives, and busts the pages the caller names', async () => {
        const hookResult = renderRunner();

        await act(() =>
            hookResult.current(
                reorderWith({
                    scopeKey: 'statuses:space-1',
                    successMessage: 'Order saved',
                    bustCache: { prefixes: ['/lists/'] },
                }),
            ),
        );

        expect(mocks.eventLog).toContain('toast.success:Order saved');
        expect(mocks.eventLog).toContain('bust:/lists/');
    });

    it('cancels and reloads only the query the caller names', async () => {
        const queryClient = new QueryClient();
        const cancelQueries = vi.spyOn(queryClient, 'cancelQueries').mockResolvedValue();
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
        const wrapper = ({ children }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );
        const { result: hookResult } = renderHook(() => useReorderRunner(), { wrapper });

        await act(() =>
            hookResult.current(reorderWith({ scopeKey: 'spaces', queryKey: ['spaces'] })),
        );

        expect(cancelQueries).toHaveBeenCalledTimes(1);
        expect(cancelQueries).toHaveBeenCalledWith({ queryKey: ['spaces'] });
        expect(invalidateQueries).toHaveBeenCalledTimes(1);
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['spaces'] });
    });

    it('lets a space reorder and a list reorder save at once, but not two of the same space', async () => {
        const hookResult = renderRunner();
        let finishSpaceSave;
        const spaceSave = vi.fn(
            () =>
                new Promise((resolve) => {
                    finishSpaceSave = () => resolve(null);
                }),
        );
        const listSave = vi.fn(async () => null);

        let spaceReorder;
        act(() => {
            spaceReorder = hookResult.current(reorderWith({ scopeKey: 'spaces', save: spaceSave }));
        });
        await vi.waitFor(() => expect(spaceSave).toHaveBeenCalled());
        await act(() => hookResult.current(reorderWith({ scopeKey: 'lists:sp1', save: listSave })));
        await act(() => hookResult.current(reorderWith({ scopeKey: 'spaces', save: spaceSave })));

        expect(listSave).toHaveBeenCalledTimes(1);
        expect(spaceSave).toHaveBeenCalledTimes(1);
        await act(async () => {
            finishSpaceSave();
            await spaceReorder;
        });
    });
});
