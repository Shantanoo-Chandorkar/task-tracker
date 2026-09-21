'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

// Data the Home screen shows; invalidating any of it must also refresh Home
const HOME_SOURCE_QUERY_KEYS = ['tasks', 'lists', 'sublists', 'spaces', 'statuses'];

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
                defaultOptions: {
                    queries: {
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
