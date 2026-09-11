'use client';

import { toast } from 'sonner';
import { useClipboardContext } from '@/providers/ClipboardProvider';
import { deepCloneSubtree, findDescendantIds } from '@/lib/tree';
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
     * Pastes the clipboard contents under the target parent, then clears the clipboard.
     *
     * @param {string|null} targetParentId - Parent to paste under, or null for root
     * @param {import('@tanstack/react-query').QueryClient} queryClient
     * @param {string} listId - List the paste target belongs to (the list currently being viewed)
     * @param {object[]} [flatList] - Current flat task list, needed for cut-mode's cycle guard
     */
    async function pasteTaskToParent(targetParentId, queryClient, listId, flatList) {
        if (!clipboard.mode || !clipboard.taskId) return;

        // Reparenting onto self/a descendant would make the row its own ancestor — a cycle.
        if (clipboard.mode === 'cut' && flatList) {
            if (targetParentId === clipboard.taskId) {
                toast.error("Can't paste a task into itself");
                return;
            }
            const descendantIds = findDescendantIds(clipboard.taskId, flatList);
            if (targetParentId && descendantIds.has(targetParentId)) {
                toast.error("Can't paste a task into its own subtask");
                return;
            }
            const clipboardTask = flatList.find((task) => task.id === clipboard.taskId);
            if (clipboardTask && (clipboardTask.parent_id ?? null) === (targetParentId ?? null)) {
                toast('Already there');
                return;
            }
        }

        try {
            if (clipboard.mode === 'copy') {
                const { error } = await pasteTask(clipboard.snapshot, targetParentId, listId);
                if (error) {
                    console.error('Paste failed:', error);
                    toast.error('Failed to paste task');
                    return;
                }
            } else if (clipboard.mode === 'cut') {
                const response = await fetch(`/api/tasks/${clipboard.taskId}/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        newParentId: targetParentId,
                        afterSiblingId: null,
                        listId,
                    }),
                });
                if (!response.ok) {
                    console.error('Move failed during cut-paste');
                    toast.error('Failed to move task');
                    return;
                }
            }

            clearClipboard();
            await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        } catch (caughtError) {
            console.error('Paste operation failed:', caughtError);
            toast.error('Failed to paste task');
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
