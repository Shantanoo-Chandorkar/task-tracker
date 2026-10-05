import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTasksQuery } from './useTasksQuery';

const fetchMock = vi.fn();

afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
});

function renderTasksQuery(queryClient) {
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => useTasksQuery('list-1'), { wrapper });
}

describe('useTasksQuery', () => {
    it("loads the list's tasks from /api/tasks", async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: 't1' }] });
        vi.stubGlobal('fetch', fetchMock);

        const { result } = renderTasksQuery(new QueryClient());

        await waitFor(() => expect(result.current.data).toEqual([{ id: 't1' }]));
        expect(fetchMock.mock.calls[0][0]).toBe('/api/tasks?list_id=list-1');
    });

    it('keeps loaded tasks fresh for five minutes so a tab return does not refetch the whole list', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: 't1' }] });
        vi.stubGlobal('fetch', fetchMock);
        const queryClient = new QueryClient();

        const { result } = renderTasksQuery(queryClient);
        await waitFor(() => expect(result.current.data).toBeDefined());

        const tasksQuery = queryClient.getQueryCache().find({ queryKey: ['tasks', 'list-1'] });
        expect(tasksQuery.observers[0].options.staleTime).toBe(5 * 60 * 1000);
    });

    it('aborts the request in flight when the query is cancelled, as a drag reorder does', async () => {
        let requestSignal;
        fetchMock.mockImplementation((_url, { signal }) => {
            requestSignal = signal;
            return new Promise(() => {});
        });
        vi.stubGlobal('fetch', fetchMock);
        const queryClient = new QueryClient();
        renderTasksQuery(queryClient);
        await waitFor(() => expect(requestSignal).toBeDefined());

        await queryClient.cancelQueries({ queryKey: ['tasks', 'list-1'] });

        expect(requestSignal.aborted).toBe(true);
    });
});
