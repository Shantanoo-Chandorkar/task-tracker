import { loadSpacesAndLists } from '@/lib/app-shell-data';

/**
 * Looks up a list's name for a tab title, reusing the layout's per-request read so it costs no extra query.
 *
 * @param {string} listId - Id of the list in the URL.
 * @returns {Promise<string|null>} The name, or null when the user cannot see the list or the read failed.
 */
export async function loadListName(listId) {
    try {
        const { lists } = await loadSpacesAndLists();
        return lists.find((list) => list.id === listId)?.name ?? null;
    } catch (thrown) {
        // A title is not worth an error page; the page itself surfaces the real failure
        console.error('[page-titles] could not read lists', { detail: thrown?.message });
        return null;
    }
}
