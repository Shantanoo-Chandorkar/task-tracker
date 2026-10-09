import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeAwareQueryClient, handleQueryError } from './QueryProvider';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...args) => toastError(...args) } }));
vi.mock('@tanstack/react-query-devtools', () => ({ ReactQueryDevtools: () => null }));

beforeEach(() => toastError.mockReset());

describe('handleQueryError', () => {
    it('shows one fixed-id toast when a refresh fails and the screen already has data', () => {
        const queryWithData = { state: { data: [{ id: 't1' }] } };

        handleQueryError(new Error('boom'), queryWithData);
        handleQueryError(new Error('boom'), queryWithData);

        expect(toastError).toHaveBeenCalledTimes(2);
        const toastIds = toastError.mock.calls.map(([, toastOptions]) => toastOptions.id);
        expect(new Set(toastIds).size).toBe(1);
    });

    it('stays quiet when a first load fails, since the page shows its own error', () => {
        handleQueryError(new Error('boom'), { state: { data: undefined } });

        expect(toastError).not.toHaveBeenCalled();
    });

    it('never puts the error text in the toast', () => {
        handleQueryError(new Error('secret SQL detail'), { state: { data: [] } });

        expect(JSON.stringify(toastError.mock.calls)).not.toContain('secret SQL detail');
    });
});

describe('HomeAwareQueryClient', () => {
    it.each(['tasks', 'lists', 'sublists', 'spaces', 'statuses'])(
        'also invalidates Home when %s is invalidated',
        (queryKeyFamily) => {
            const queryClient = new HomeAwareQueryClient();
            const invalidatedKeys = [];
            const parentInvalidate = vi
                .spyOn(Object.getPrototypeOf(HomeAwareQueryClient.prototype), 'invalidateQueries')
                .mockImplementation((filters) => {
                    invalidatedKeys.push(filters.queryKey[0]);
                    return Promise.resolve();
                });

            queryClient.invalidateQueries({ queryKey: [queryKeyFamily] });

            expect(invalidatedKeys).toEqual(['home', queryKeyFamily]);
            parentInvalidate.mockRestore();
        },
    );

    it('leaves Home alone when an unrelated key such as tags is invalidated', () => {
        const queryClient = new HomeAwareQueryClient();
        const invalidatedKeys = [];
        const parentInvalidate = vi
            .spyOn(Object.getPrototypeOf(HomeAwareQueryClient.prototype), 'invalidateQueries')
            .mockImplementation((filters) => {
                invalidatedKeys.push(filters.queryKey[0]);
                return Promise.resolve();
            });

        queryClient.invalidateQueries({ queryKey: ['tags', 'space-1'] });

        expect(invalidatedKeys).toEqual(['tags']);
        parentInvalidate.mockRestore();
    });
});
