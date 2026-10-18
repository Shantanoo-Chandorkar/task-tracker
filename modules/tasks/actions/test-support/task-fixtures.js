/**
 * Shared rows for the task action tests: one space with two lists, a sublist per list, both default
 * statuses, and a three-level task chain, so each test starts from the same known world.
 */

export const OWNER_ID = 'user-owner';
export const COLLABORATOR_ID = 'user-collab';

/**
 * Builds the table rows for the in-memory fake client.
 *
 * @param {object} [options]
 * @param {object} [options.space] - Fields merged over the space row (e.g. `require_due_date`)
 * @param {string|null} [options.collaboratorLevel] - Adds an accepted collaborator with this tier
 * @param {object[]} [options.extraTasks] - Rows appended to the task chain
 * @returns {Record<string, object[]>} Rows per table name
 */
export function buildTaskTables({ space = {}, collaboratorLevel = null, extraTasks = [] } = {}) {
    const taskBase = {
        list_id: 'list-1',
        sublist_id: null,
        created_by: OWNER_ID,
        status_id: 'status-todo',
    };
    return {
        spaces: [
            {
                id: 'space-1',
                owner_id: OWNER_ID,
                require_due_date: false,
                max_subtasks_per_parent: null,
                ...space,
            },
        ],
        space_collaborators: collaboratorLevel
            ? [
                  {
                      space_id: 'space-1',
                      user_id: COLLABORATOR_ID,
                      status: 'accepted',
                      permission_level: collaboratorLevel,
                  },
              ]
            : [],
        lists: [
            { id: 'list-1', space_id: 'space-1' },
            { id: 'list-2', space_id: 'space-1' },
        ],
        sublists: [
            { id: 'sublist-1', list_id: 'list-1' },
            { id: 'sublist-2', list_id: 'list-2' },
        ],
        statuses: [
            { id: 'status-todo', space_id: 'space-1', code: 'todo', is_default: true },
            { id: 'status-done', space_id: 'space-1', code: 'done', is_default: false },
        ],
        tasks: [
            { ...taskBase, id: 'task-1', parent_id: null, depth: 0, position: 1 },
            { ...taskBase, id: 'task-2', parent_id: 'task-1', depth: 1, position: 1 },
            { ...taskBase, id: 'task-3', parent_id: 'task-2', depth: 2, position: 1 },
            ...extraTasks,
        ],
    };
}
