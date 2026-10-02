import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function openAndType(text) {
    render(<GlobalSearch />);
    act(() => openSearch());
    fireEvent.change(screen.getByRole('combobox', { name: 'Search tasks, lists, spaces' }), {
        target: { value: text },
    });
}

describe('GlobalSearch accessibility', () => {
    it('names the search input', () => {
        render(<GlobalSearch />);
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
