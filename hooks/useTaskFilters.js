'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
    parseTaskFilters,
    filtersToSearchString,
    countActiveFilters,
    EMPTY_TASK_FILTERS,
} from '@/lib/task-filters';

/**
 * URL-backed task-list filter state, shared by the list page's filter compute and the sheet.
 *
 * @returns {{filters: object, toggleFilter: Function, applyFilters: Function, clearAll: Function, activeCount: number}}
 */
export function useTaskFilters() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    // Rebuilt from the string, not searchParams itself, so filters stays referentially stable per URL.
    const searchParamsKey = searchParams.toString();
    const filters = useMemo(
        () => parseTaskFilters(new URLSearchParams(searchParamsKey)),
        [searchParamsKey],
    );

    const applyFilters = useCallback(
        (nextFilters) => {
            const search = filtersToSearchString(nextFilters);
            // Not router.replace: that re-runs the whole server page on every apply, though filtering is client-side
            window.history.replaceState(null, '', search ? `${pathname}?${search}` : pathname);
        },
        [pathname],
    );

    const toggleFilter = useCallback(
        (dimension, value) => {
            const currentValues = filters[dimension] ?? [];
            const nextValues = currentValues.includes(value)
                ? currentValues.filter((existingValue) => existingValue !== value)
                : [...currentValues, value];
            applyFilters({ ...filters, [dimension]: nextValues });
        },
        [filters, applyFilters],
    );

    const clearAll = useCallback(() => {
        applyFilters(EMPTY_TASK_FILTERS);
    }, [applyFilters]);

    return {
        filters,
        toggleFilter,
        applyFilters,
        clearAll,
        activeCount: countActiveFilters(filters),
    };
}
