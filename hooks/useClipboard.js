'use client';

import { useClipboardContext } from '@/providers/ClipboardProvider';
import { deepCloneSubtree } from '@/lib/tree';
import { pasteTask } from '@/actions/task-actions';

/**
 * Provides clipboard operations (copy, cut, paste) for the task tree.
 * Wraps ClipboardContext with the actual operation logic.
 *
 * @returns {{ clipboard: object, copyTask: Function, cutTask: Function, pasteTask: Function }}
 */
export function useClipboard() {
    const { clipboard, setClipboard, clearClipboard } = useClipboardContext();

    /**
     * Copies a task subtree to the clipboard without modifying the original.
     *
     * @param {string} taskId - ID of the task to copy
     * @param {object[]} flatList - Current flat list of all tasks
     */
    function copyTask(taskId, flatList) {
        const snapshot = deepCloneSubtree(taskId, flatList);
        if (!snapshot) return;
        setClipboard({ mode: 'copy', taskId, snapshot });
    }

    /**
     * Marks a task for cut. The original is NOT deleted yet — it is only moved on paste.
     * Applies opacity-40 styling to the source row via clipboard context.
     *
     * @param {string} taskId - ID of the task to cut
     * @param {object[]} flatList - Current flat list of all tasks
     */
    function cutTask(taskId, flatList) {
        const snapshot = deepCloneSubtree(taskId, flatList);
        if (!snapshot) return;
        setClipboard({ mode: 'cut', taskId, snapshot });
    }

    /**
     * Pastes the clipboard contents under the target parent.
     * - Copy mode: recursively inserts the snapshot with new IDs via server action
     * - Cut mode: moves the original task via the move API
     * Always clears the clipboard and invalidates the task query after pasting.
     *
     * @param {string|null} targetParentId - Parent to paste under, or null for root
     * @param {import('@tanstack/react-query').QueryClient} queryClient
     */
    async function pasteTaskToParent(targetParentId, queryClient) {
        if (!clipboard.mode || !clipboard.taskId) return;

        try {
            if (clipboard.mode === 'copy') {
                const { error } = await pasteTask(clipboard.snapshot, targetParentId);
                if (error) {
                    console.error('Paste failed:', error);
                    return;
                }
            } else if (clipboard.mode === 'cut') {
                const response = await fetch(`/api/tasks/${clipboard.taskId}/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newParentId: targetParentId, afterId: null }),
                });
                if (!response.ok) {
                    console.error('Move failed during cut-paste');
                    return;
                }
            }

            clearClipboard();
            await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        } catch (err) {
            console.error('Paste operation failed:', err);
        }
    }

    return {
        clipboard,
        copyTask,
        cutTask,
        pasteTask: pasteTaskToParent,
        clearClipboard,
    };
}
