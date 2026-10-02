/**
 * Drops one row from every cached list under a key prefix, so a deleted row vanishes on server confirm.
 *
 * @param {import('@tanstack/react-query').QueryClient} queryClient - Client holding the cache.
 * @param {string[]} queryKey - Key prefix of the cached row arrays.
 * @param {string} rowId - Id of the row that was deleted.
 */
export function removeRowFromCache(queryClient, queryKey, rowId) {
    queryClient.setQueriesData({ queryKey }, (cachedRows) =>
        Array.isArray(cachedRows) ? cachedRows.filter((row) => row.id !== rowId) : cachedRows,
    );
}

/**
 * Returns the cached rows with the saved row merged in (edit) or appended (create, only when defaults are given).
 *
 * @param {object[]|undefined} cachedRows - Rows currently cached, undefined if the query never loaded.
 * @param {object} savedRow - Row the server action returned.
 * @param {boolean} isEditing - Whether the save was an update.
 * @param {object} [createdRowDefaults] - Cache-only fields a new row needs; without them nothing is appended.
 * @returns {object[]|undefined} The rows to cache.
 */
export function withSavedRow(cachedRows, savedRow, isEditing, createdRowDefaults) {
    if (!cachedRows) return cachedRows;
    if (isEditing) {
        return cachedRows.map((row) => (row.id === savedRow.id ? { ...row, ...savedRow } : row));
    }
    if (!createdRowDefaults || cachedRows.some((row) => row.id === savedRow.id)) return cachedRows;
    return [...cachedRows, { ...createdRowDefaults, ...savedRow }];
}

/**
 * Adds the status name and color a task row carries in the cache, which the action's raw row lacks.
 *
 * @param {object} savedTask - Task row the server action returned.
 * @param {object[]} statuses - Statuses of the task's space, from the cache.
 * @returns {object} The task with `status_name` and `status_color` filled from its status, or null when it has none.
 */
export function withStatusDisplay(savedTask, statuses) {
    const taskStatus = statuses.find((status) => status.id === savedTask.status_id);
    return {
        ...savedTask,
        status_name: taskStatus?.name ?? null,
        status_color: taskStatus?.color ?? null,
    };
}
