'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { withSavedRow, withStatusDisplay } from '@/lib/cache/query-cache';
import { buildEditConflictMessage, describeTaskChanges } from '@/lib/tasks/task-edit-conflict';

/**
 * Remembers which version of a task the edit dialog was opened on, and handles the save being refused because
 * someone changed the task since.
 *
 * @returns {{
 *   expectedUpdatedAt: string|undefined,
 *   startEditing: (task: object|null) => void,
 *   resolveConflict: (conflict: { currentTask: object, taskListId: string, statuses: object[] }) => string,
 * }} `startEditing` fixes the version at open. `resolveConflict` moves it to the stored task, shows that task in the
 *   list, and returns the message for the dialog.
 */
export function useTaskEditConflict() {
    const queryClient = useQueryClient();
    const [editBaseline, setEditBaseline] = useState(null);

    function startEditing(task) {
        setEditBaseline(task ? { updatedAt: task.updated_at, task } : null);
    }

    function resolveConflict({ currentTask, taskListId, statuses }) {
        const changedFieldNames = editBaseline
            ? describeTaskChanges(editBaseline.task, currentTask)
            : [];
        setEditBaseline({ updatedAt: currentTask.updated_at, task: currentTask });
        queryClient.setQueryData(['tasks', taskListId], (cachedTasks) =>
            withSavedRow(cachedTasks, withStatusDisplay(currentTask, statuses), true),
        );
        return buildEditConflictMessage(changedFieldNames);
    }

    return { expectedUpdatedAt: editBaseline?.updatedAt, startEditing, resolveConflict };
}
