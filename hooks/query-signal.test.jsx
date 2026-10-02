import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCollaboratorsQuery } from './useCollaboratorsQuery';
import { useCurrentUserProfileQuery } from './useCurrentUserProfileQuery';
import { useHomeQuery } from './useHomeQuery';
import { useJoinRequestsQuery } from './useJoinRequestsQuery';
import { useListsQuery } from './useListsQuery';
import { usePendingInvitesQuery } from './usePendingInvitesQuery';
import { useSpacesQuery } from './useSpacesQuery';
import { useStatusesQuery } from './useStatusesQuery';
import { useSublistsQuery } from './useSublistsQuery';
import { useTagsQuery } from './useTagsQuery';

const queryHooks = [
    ['useCollaboratorsQuery', () => useCollaboratorsQuery('space-1'), '/api/space-collaborators'],
    ['useCurrentUserProfileQuery', () => useCurrentUserProfileQuery(), '/api/profile'],
    ['useHomeQuery', () => useHomeQuery(), '/api/home'],
    ['useJoinRequestsQuery', () => useJoinRequestsQuery('space-1'), '/api/space-collaborators'],
    ['useListsQuery', () => useListsQuery(), '/api/lists'],
    ['usePendingInvitesQuery', () => usePendingInvitesQuery('space-1'), '/api/space-invites'],
    ['useSpacesQuery', () => useSpacesQuery(), '/api/spaces'],
    ['useStatusesQuery', () => useStatusesQuery('space-1'), '/api/statuses'],
    ['useSublistsQuery', () => useSublistsQuery('list-1'), '/api/sublists'],
    ['useTagsQuery', () => useTagsQuery('space-1'), '/api/tags'],
];

const fetchMock = vi.fn();

afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
});

describe('query hooks forward the abort signal', () => {
    it.each(queryHooks)(
        "%s passes TanStack Query's signal to fetch",
        async (_hookName, useHook, expectedPath) => {
            fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
            vi.stubGlobal('fetch', fetchMock);
            const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
            const wrapper = ({ children }) => (
                <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
            );

            renderHook(useHook, { wrapper });

            await waitFor(() => expect(fetchMock).toHaveBeenCalled());
            const [requestedUrl, requestOptions] = fetchMock.mock.calls[0];
            expect(requestedUrl).toContain(expectedPath);
            expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
        },
    );
});
