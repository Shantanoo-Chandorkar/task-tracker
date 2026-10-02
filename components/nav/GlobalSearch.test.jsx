import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GlobalSearch, { openSearch } from './GlobalSearch';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

// cmdk and Radix measure and scroll elements, which jsdom does not implement
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

const fetchResults = vi.fn();

beforeEach(() => {
    globalThis.fetch = (...args) => fetchResults(...args);
});

afterEach(cleanup);

function renderSearch() {
    return render(
        <QueryClientProvider client={new QueryClient()}>
            <GlobalSearch />
        </QueryClientProvider>,
    );
}

function openAndType(text) {
    renderSearch();
    act(() => openSearch());
    fireEvent.change(screen.getByRole('combobox', { name: 'Search tasks, lists, spaces' }), {
        target: { value: text },
    });
}

describe('GlobalSearch accessibility', () => {
    it('names the search input', () => {
        renderSearch();
        act(() => openSearch());

        expect(screen.getByRole('combobox', { name: 'Search tasks, lists, spaces' })).toBeTruthy();
    });

    it('announces how many results came back', async () => {
        fetchResults.mockResolvedValue({
            ok: true,
            json: async () => ({
                tasks: [{ id: 't1', title: 'Buy milk', list_id: 'l1' }],
                lists: [{ id: 'l1', name: 'Groceries' }],
                spaces: [],
            }),
        });
        openAndType('milk');

        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('2 results'));
    });

    it('announces when nothing matched', async () => {
        fetchResults.mockResolvedValue({
            ok: true,
            json: async () => ({ tasks: [], lists: [], spaces: [] }),
        });
        openAndType('zzz');

        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('No results'));
    });
});

describe('GlobalSearch failures and cancellation', () => {
    it('says search is unavailable when the server answers with an error, not "No results"', async () => {
        fetchResults.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
        openAndType('milk');

        await waitFor(() =>
            expect(screen.getByRole('status').textContent).toBe(
                'Search is unavailable. Check your connection and try again.',
            ),
        );
    });

    it('says search is unavailable when the request cannot reach the server', async () => {
        fetchResults.mockRejectedValue(new TypeError('Failed to fetch'));
        openAndType('milk');

        await waitFor(() =>
            expect(screen.getByRole('status').textContent).toContain('Search is unavailable'),
        );
    });

    it('aborts the previous request when the search text changes', async () => {
        const requestSignals = [];
        fetchResults.mockImplementation((_url, { signal }) => {
            requestSignals.push(signal);
            return new Promise(() => {});
        });
        openAndType('mi');
        await waitFor(() => expect(requestSignals).toHaveLength(1));

        fireEvent.change(screen.getByRole('combobox', { name: 'Search tasks, lists, spaces' }), {
            target: { value: 'milk' },
        });
        await waitFor(() => expect(requestSignals).toHaveLength(2));

        expect(requestSignals[0].aborted).toBe(true);
        expect(requestSignals[1].aborted).toBe(false);
    });
});
