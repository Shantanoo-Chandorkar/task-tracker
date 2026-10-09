'use client';

import { useEffect, useState } from 'react';
import { useDuplicateTask } from '@/hooks/useDuplicateTask';

// Ctrl/Cmd+D inside these keeps the browser's own meaning instead of duplicating the remembered row.
const TYPING_OR_DIALOG_SELECTOR =
    'input, textarea, select, [contenteditable="true"], [role="dialog"]';

/**
 * Makes Ctrl/Cmd+D duplicate whichever task row was last clicked or focused.
 *
 * @param {string} listId - The list whose cached tasks and counts are refreshed after a duplicate
 * @returns {(taskId: string) => void} Call with a task's id to remember it as the row the shortcut acts on.
 */
export function useDuplicateShortcut(listId) {
    const { duplicateTaskById } = useDuplicateTask(listId);
    const [focusedTaskId, setFocusedTaskId] = useState(null);

    useEffect(() => {
        function handleKeyDown(keyboardEvent) {
            const isCtrl = keyboardEvent.ctrlKey || keyboardEvent.metaKey;
            if (!isCtrl || keyboardEvent.key !== 'd' || !focusedTaskId) return;

            // The remembered row must not capture the key while the user types or works inside a dialog
            if (keyboardEvent.target.closest?.(TYPING_OR_DIALOG_SELECTOR)) return;

            keyboardEvent.preventDefault();
            if (keyboardEvent.repeat) return;
            duplicateTaskById(focusedTaskId);
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedTaskId, duplicateTaskById]);

    return setFocusedTaskId;
}
