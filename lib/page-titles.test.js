import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadSpacesAndLists = vi.fn();
vi.mock('@/lib/app-shell-data', () => ({
    loadSpacesAndLists: (...args) => loadSpacesAndLists(...args),
}));

const LIST_ID = '3f2b1c4e-5d6a-4b7c-8d9e-0a1b2c3d4e5f';

describe('loadListName', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns the name of the list the signed-in user can see', async () => {
        loadSpacesAndLists.mockResolvedValue({ lists: [{ id: LIST_ID, name: 'Groceries' }] });
        const { loadListName } = await import('./page-titles');

        expect(await loadListName(LIST_ID)).toBe('Groceries');
    });

    it('returns null for a list the user cannot see, so no name leaks into the title', async () => {
        loadSpacesAndLists.mockResolvedValue({ lists: [{ id: 'other', name: 'Secret' }] });
        const { loadListName } = await import('./page-titles');

        expect(await loadListName(LIST_ID)).toBeNull();
    });

    it('returns null instead of throwing when the lists cannot be loaded', async () => {
        loadSpacesAndLists.mockRejectedValue(new Error('database down'));
        const { loadListName } = await import('./page-titles');

        expect(await loadListName(LIST_ID)).toBeNull();
    });
});
