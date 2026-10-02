/**
 * Counts what deleting a space would remove, from the lists already cached on the client.
 *
 * @param {string} spaceId - Space about to be deleted.
 * @param {object[]} cachedLists - Lists from the ['lists'] cache, each with `space_id` and `task_count`.
 * @returns {{ lists: number, tasks: number }} Lists in the space and the tasks inside them.
 */
export function countSpaceContents(spaceId, cachedLists) {
    const spaceLists = cachedLists.filter((list) => list.space_id === spaceId);
    return {
        lists: spaceLists.length,
        tasks: spaceLists.reduce((taskTotal, list) => taskTotal + (list.task_count ?? 0), 0),
    };
}
