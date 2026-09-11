'use client';

import { createTask, updateTask, deleteTask, deleteTaskAndReparentChildren } from '@/actions/task-actions';

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
