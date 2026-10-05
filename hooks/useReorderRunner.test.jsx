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
    bustPageCache: ({ urls }) => mocks.eventLog.push(`bust:${urls.join(',')}`),
}));

const QUERY_KEY = ['tasks', 'list-1'];

function renderRunner(listId = 'list-1') {
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
    return renderHook(() => useReorderRunner(listId), { wrapper }).result;
}

function reorderWith(overrides = {}) {
    return {
        scopeKey: 'tasks',
        queryKey: QUERY_KEY,
        applyOptimistic: () => mocks.eventLog.push('optimistic'),
        save: async () => {
            mocks.eventLog.push('save');
            return null;
        },
        failureMessage: 'Failed to reorder task',
        ...overrides,
    };
}

describe('useReorderRunner', () => {
    beforeEach(() => {
        mocks.eventLog.length = 0;
    });
    afterEach(() => vi.restoreAllMocks());

    it('stops reloads, shows the new order, saves it, refreshes and confirms, in that order', async () => {
        const result = renderRunner();

        await act(() => result.current(reorderWith()));

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
        const result = renderRunner();

        await act(() => result.current(reorderWith({ save: async () => 'Not allowed' })));

        expect(mocks.eventLog.slice(3)).toEqual([
            'toast.error:Not allowed',
            'invalidate',
            'bust:/lists/list-1',
        ]);
    });

    it('treats a throw as a lost connection: failure message, then refresh', async () => {
        const result = renderRunner();
        const save = async () => {
            throw new Error('offline');
        };

        await act(() => result.current(reorderWith({ save })));

        expect(mocks.eventLog.slice(3)).toEqual([
            'toast.error:Failed to reorder task',
            'invalidate',
            'bust:/lists/list-1',
        ]);
    });

    it('turns a second reorder in the same scope away with the busy message', async () => {
        const result = renderRunner('busy-list');
        let finishFirstSave;
        const slowSave = () =>
            new Promise((resolve) => {
                finishFirstSave = () => resolve(null);
            });
        const saveSpy = vi.fn(slowSave);

        let firstReorder;
        act(() => {
            firstReorder = result.current(reorderWith({ save: saveSpy }));
        });
        await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
        await act(() => result.current(reorderWith({ save: saveSpy })));

        expect(mocks.eventLog).toContain(`toast.info:${REORDER_BUSY_MESSAGE}`);
        expect(saveSpy).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishFirstSave();
            await firstReorder;
        });
    });

    it('lets two different scopes save at once', async () => {
        const result = renderRunner('two-scopes');
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
            taskReorder = result.current(reorderWith({ save: taskSave }));
        });
        await vi.waitFor(() => expect(taskSave).toHaveBeenCalled());
        await act(() => result.current(reorderWith({ scopeKey: 'sublists', save: sublistSave })));

        expect(sublistSave).toHaveBeenCalledTimes(1);
        await act(async () => {
            finishTaskSave();
            await taskReorder;
        });
    });

    it('is free again after a finished save, even a failed one', async () => {
        const result = renderRunner('free-again');
        const save = vi.fn(async () => 'Not allowed');

        await act(() => result.current(reorderWith({ save })));
        await act(() => result.current(reorderWith({ save })));

        expect(save).toHaveBeenCalledTimes(2);
    });
});
