'use client';

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';
import { toast } from 'sonner';
import { shouldRetryRequest } from '@/lib/fetch-json';

// Data the Home screen shows; invalidating any of it must also refresh Home
const HOME_SOURCE_QUERY_KEYS = ['tasks', 'lists', 'sublists', 'spaces', 'statuses'];

// A fixed id makes Sonner replace the toast instead of stacking one per failed query
const REFRESH_FAILED_TOAST_ID = 'query-refresh-failed';

/**
 * Tells the user a background refresh failed, but only when the screen already has data to keep showing.
 * A first load that fails has no data, and the page's own error state covers that.
 *
 * @param {Error} _error - What the query threw; not shown, since it can carry server wording.
 * @param {import('@tanstack/react-query').Query} failedQuery - The query that failed.
 */
export function handleQueryError(_error, failedQuery) {
    if (failedQuery.state.data === undefined) return;
    toast.error('Could not refresh. Showing saved data.', { id: REFRESH_FAILED_TOAST_ID });
}

/**
 * QueryClient that refreshes the Home summary whenever the data behind it is invalidated.
 * Done here rather than at each call site, because a mutation site that forgets it leaves Home stale.
 */
class HomeAwareQueryClient extends QueryClient {
    /**
     * Invalidates the matching queries, and Home as well when the keys are ones Home is built from.
     *
     * @param {object} [filters] - TanStack Query filters, usually `{ queryKey }`.
     * @param {object} [options] - TanStack Query invalidate options.
     * @returns {Promise<void>} Resolves when the matching active queries have refetched.
     */
    invalidateQueries(filters, options) {
        if (HOME_SOURCE_QUERY_KEYS.includes(filters?.queryKey?.[0])) {
            super.invalidateQueries({ queryKey: ['home'] });
        }
        return super.invalidateQueries(filters, options);
    }
}

/**
 * Wraps the application with TanStack Query's provider.
 * Creates a stable QueryClient instance per React tree.
 * Mounts DevTools in development only to avoid production bundle bloat.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 */
export function QueryProvider({ children }) {
    const [queryClient] = useState(
        () =>
            new HomeAwareQueryClient({
                queryCache: new QueryCache({ onError: handleQueryError }),
                defaultOptions: {
                    queries: {
                        retry: shouldRetryRequest,
                        // Keep data fresh for 60 seconds before marking stale
                        staleTime: 60 * 1000,
                    },
                },
            }),
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
            {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
    );
}
