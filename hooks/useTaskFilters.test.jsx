import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTaskFilters } from './useTaskFilters';

const routerReplace = vi.fn();
const searchParamsText = vi.hoisted(() => ({ current: '' }));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: (...args) => routerReplace(...args) }),
    usePathname: () => '/lists/list-1',
    useSearchParams: () => new URLSearchParams(searchParamsText.current),
}));

let replaceStateSpy;

beforeEach(() => {
    searchParamsText.current = '';
    routerReplace.mockClear();
    replaceStateSpy = vi.spyOn(window.history, 'replaceState');
});

afterEach(() => {
    replaceStateSpy.mockRestore();
});

describe('useTaskFilters', () => {
    it('reads the filters from the URL', () => {
        searchParamsText.current = 'status=s1%2Cs2&tag=t1';

        const { result } = renderHook(() => useTaskFilters());

        expect(result.current.filters.statusIds).toEqual(['s1', 's2']);
        expect(result.current.filters.tagIds).toEqual(['t1']);
        expect(result.current.activeCount).toBe(3);
    });

    it('writes applied filters into the URL without asking Next to load the page again', () => {
        const { result } = renderHook(() => useTaskFilters());

        act(() => {
            result.current.applyFilters({ ...result.current.filters, statusIds: ['s1', 's2'] });
        });

        expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/lists/list-1?status=s1%2Cs2');
        expect(routerReplace).not.toHaveBeenCalled();
    });

    it('goes back to the plain path when every filter is cleared', () => {
        searchParamsText.current = 'status=s1';
        const { result } = renderHook(() => useTaskFilters());

        act(() => result.current.clearAll());

        expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/lists/list-1');
        expect(routerReplace).not.toHaveBeenCalled();
    });

    it('adds and removes one value with toggleFilter', () => {
        searchParamsText.current = 'status=s1';
        const { result } = renderHook(() => useTaskFilters());

        act(() => result.current.toggleFilter('statusIds', 's2'));
        expect(replaceStateSpy).toHaveBeenLastCalledWith(null, '', '/lists/list-1?status=s1%2Cs2');

        act(() => result.current.toggleFilter('statusIds', 's1'));
        expect(replaceStateSpy).toHaveBeenLastCalledWith(null, '', '/lists/list-1');
    });
});
