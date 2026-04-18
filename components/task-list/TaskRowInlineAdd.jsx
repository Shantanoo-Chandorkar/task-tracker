'use client';

import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createTask } from '@/actions/task-actions';
import { Plus } from 'lucide-react';

/**
 * Inline subtask creation input that appears directly below a task row.
 * Activated when visible is true. Pressing Enter creates the subtask.
 * Pressing Escape cancels without creating anything.
 *
 * @param {object} props
 * @param {object} props.task - The parent task
 * @param {number} props.depth - Depth of the parent (children will be depth + 1)
 * @param {boolean} props.visible - Whether the input is currently shown
 * @param {Function} props.onClose - Called when the input should hide
 */
export default function TaskRowInlineAdd({ task, depth, visible, onClose }) {
    const queryClient = useQueryClient();
    const [value, setValue] = useState('');
    const inputRef = useRef(null);

    // Focus the input whenever it becomes visible
    useEffect(() => {
        if (visible) {
            setValue('');
            inputRef.current?.focus();
        }
    }, [visible]);

    if (!visible) return null;

    async function handleKeyDown(e) {
        if (e.key === 'Enter' && value.trim()) {
            e.preventDefault();
            await createTask({ title: value.trim(), parent_id: task.id });
            await queryClient.invalidateQueries({ queryKey: ['tasks'] });
            setValue('');
            onClose();
        } else if (e.key === 'Escape') {
            onClose();
        }
    }

    return (
        <div
            className="flex items-center gap-1.5 py-1 px-2"
            style={{ paddingLeft: `${(depth + 1) * 24 + 8}px` }}
        >
            <Plus className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={onClose}
                placeholder="Subtask name..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none border-b border-border focus:border-ring pb-0.5"
            />
        </div>
    );
}
