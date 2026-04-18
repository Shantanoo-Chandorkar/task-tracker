'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import { deleteTask, deleteTaskAndReparentChildren } from '@/actions/task-actions';
import { useClipboard } from '@/hooks/useClipboard';
import { findAncestors, findDescendantIds } from '@/lib/tree';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import DeleteTaskDialog from '@/components/task-list/DeleteTaskDialog';

/**
 * Hover-visible action bar for a task row.
 * Shows inline edit and delete buttons, plus a `···` dropdown with the full action set.
 *
 * @param {object} props
 * @param {object} props.task - The task this action bar belongs to
 * @param {object[]} props.flatList - Full flat list for move/promote/delete lookups
 * @param {Function} props.onAddSubtask - Called when "Add Subtask" is selected
 */
export default function TaskRowActions({ task, flatList, onAddSubtask }) {
    const queryClient = useQueryClient();
    const { clipboard, copyTask, cutTask, pasteTask } = useClipboard();
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);

    // Compute rearrange context
    const parent = flatList.find((t) => t.id === task.parent_id);
    const grandparentId = parent?.parent_id ?? null;
    const canPromote = Boolean(task.parent_id);
    const hasPaste = Boolean(clipboard.mode && clipboard.taskId);

    // All tasks that are valid reparent destinations:
    // exclude the task itself, its current parent (already there), and any descendants (cycle)
    const descendantIds = findDescendantIds(task.id, flatList);
    const validTargets = flatList
        .filter((t) => t.id !== task.id && t.id !== task.parent_id && !descendantIds.has(t.id))
        .sort((a, b) => a.depth - b.depth || a.title.localeCompare(b.title));

    /**
     * Builds a breadcrumb label for a target task so duplicate titles are unambiguous.
     * e.g. "Project › Design › Wireframes"
     *
     * @param {object} target - Task to build a breadcrumb for
     * @returns {string} Breadcrumb-style label
     */
    function getBreadcrumb(target) {
        const ancestors = findAncestors(target.id, flatList).reverse();
        return [...ancestors.map((a) => a.title), target.title].join(' › ');
    }

    async function handleDeleteConfirm(strategy) {
        setDeleteOpen(false);
        if (strategy === 'reparent') {
            await deleteTaskAndReparentChildren(task.id);
        } else {
            await deleteTask(task.id);
        }
        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }

    async function handlePromote() {
        await fetch(`/api/tasks/${task.id}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newParentId: grandparentId, afterId: task.parent_id }),
        });
        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }

    async function handleMoveTo(targetId) {
        await fetch(`/api/tasks/${task.id}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newParentId: targetId, afterId: null }),
        });
        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }

    async function handlePaste() {
        await pasteTask(task.id, queryClient);
    }

    return (
        <>
            {/* Inline edit/delete buttons visible on row hover */}
            <div className="invisible group-hover:visible flex items-center gap-0.5 flex-shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditOpen(true)}
                    aria-label="Edit task"
                >
                    <Pencil className="h-3 w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                    aria-label="Delete task"
                >
                    <Trash2 className="h-3 w-3" />
                </Button>

                {/* ··· context menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            aria-label="More actions"
                        >
                            <MoreHorizontal className="h-3 w-3" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                        <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={onAddSubtask}>Add Subtask</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => copyTask(task.id, flatList)}>
                            Copy
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => cutTask(task.id, flatList)}>
                            Cut
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={handlePaste}
                            disabled={!hasPaste}
                            className={!hasPaste ? 'opacity-40' : ''}
                        >
                            Paste here
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />

                        {/* Promote — only for non-root tasks */}
                        {canPromote && (
                            <DropdownMenuItem onClick={handlePromote}>
                                Promote to sibling
                            </DropdownMenuItem>
                        )}

                        {/* Move to — shows all valid reparent destinations with breadcrumb paths */}
                        {validTargets.length > 0 && (
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>Move to...</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                                    {validTargets.map((target) => (
                                        <DropdownMenuItem
                                            key={target.id}
                                            onClick={() => handleMoveTo(target.id)}
                                        >
                                            {getBreadcrumb(target)}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                        )}

                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => setDeleteOpen(true)}
                            className="text-destructive focus:text-destructive"
                        >
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Edit dialog */}
            <TaskFormDialog open={editOpen} onClose={() => setEditOpen(false)} task={task} />

            {/* Delete confirmation dialog */}
            <DeleteTaskDialog
                open={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                task={task}
                flatList={flatList}
                onConfirm={handleDeleteConfirm}
            />
        </>
    );
}
