'use client';

import {
    createTask,
    updateTask,
    deleteTask,
    deleteTaskAndReparentChildren,
    moveTask,
    duplicateTask,
    completeTaskAndDescendants,
} from '@/actions/task-actions';
import { createStatus, updateStatus, deleteStatus } from '@/actions/status-actions';
import { createSublist, updateSublist, deleteSublist } from '@/actions/sublist-actions';
import { createList, updateList, deleteList } from '@/actions/list-actions';
import { createSpace, updateSpace, deleteSpace } from '@/actions/space-actions';

const handlers = new Map();

/**
 * Registers the real function that performs a given offline-queueable mutation type.
 *
 * @param {string} type - Mutation type name, e.g. 'updateTask'
 * @param {(payload: object) => Promise<{ error: string|null }>} handler
 */
export function registerMutation(type, handler) {
    handlers.set(type, handler);
}

/**
 * Looks up the handler registered for a mutation type.
 *
 * @param {string} type - Mutation type name
 * @returns {((payload: object) => Promise<{ error: string|null }>)|undefined}
 */
export function getMutationHandler(type) {
    return handlers.get(type);
}

registerMutation('updateTask', (payload) => updateTask(payload.taskId, payload.fields));
registerMutation('createTask', (payload) => createTask(payload.fields));
registerMutation('deleteTask', (payload) => deleteTask(payload.taskId));
registerMutation('deleteTaskAndReparentChildren', async (payload) => {
    const result = await deleteTaskAndReparentChildren(payload.taskId);
    // A replay landing after the delete already succeeded looks like "not found" —
    // that's the goal state, not a failure, so don't surface it as a sync error.
    if (result.error === 'Task not found') return { error: null };
    return result;
});
registerMutation('moveTask', (payload) => moveTask(payload.taskId, payload.params));
registerMutation('duplicateTask', (payload) => duplicateTask(payload.taskId, payload.newRootId));
registerMutation('completeTaskAndDescendants', (payload) =>
    completeTaskAndDescendants(payload.taskId),
);

registerMutation('createStatus', (payload) => createStatus(payload.fields));
registerMutation('updateStatus', (payload) => updateStatus(payload.id, payload.fields));
registerMutation('deleteStatus', (payload) => deleteStatus(payload.id));

registerMutation('createSublist', (payload) => createSublist(payload.fields));
registerMutation('updateSublist', (payload) => updateSublist(payload.id, payload.fields));
registerMutation('deleteSublist', (payload) => deleteSublist(payload.id));

registerMutation('createList', (payload) => createList(payload.fields));
registerMutation('updateList', (payload) => updateList(payload.id, payload.fields));
registerMutation('deleteList', (payload) => deleteList(payload.id));

registerMutation('createSpace', (payload) => createSpace(payload.fields));
registerMutation('updateSpace', (payload) => updateSpace(payload.id, payload.fields));
registerMutation('deleteSpace', (payload) => deleteSpace(payload.id));
