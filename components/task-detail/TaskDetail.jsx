'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Plus } from 'lucide-react';
import { findAncestors, findDescendantIds, flatToTree } from '@/lib/tree';
import { humanReadableLabel } from '@/lib/recurrence';
import StatusBadge from '@/components/status/StatusBadge';
import TaskRowActions from '@/components/task-list/TaskRowActions';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import SubtaskTree from './SubtaskTree';
import { Button } from '@/components/ui/button';

/**
 * Task detail page content — title, status, description, recurrence, and the
 * full nested subtask tree. Shares the same `['tasks', listId]` query cache as
 * the list view, so edits made from either place stay in sync without a new
 * API route.
 *
 * @param {object} props
 * @param {string} props.listId - List this task belongs to
 * @param {string} props.taskId - Task being viewed
 * @param {object[]} props.initialTasks - SSR-fetched flat task list for this list (hydrates the query)
 */
export default function TaskDetail({ listId, taskId, initialTasks }) {
    const router = useRouter();
    const [addSubtaskOpen, setAddSubtaskOpen] = useState(false);

    const { data: flatList = [] } = useQuery({
        queryKey: ['tasks', listId],
        queryFn: async () => {
            const response = await fetch(`/api/tasks?list_id=${listId}`);
            if (!response.ok) throw new Error('Failed to fetch tasks');
            return response.json();
        },
        initialData: initialTasks,
    });

    const task = flatList.find((task) => task.id === taskId);

    if (!task || task.list_id !== listId) {
        return (
            <div className="text-center py-24">
                <p className="text-sm text-foreground mb-1">This task doesn&apos;t exist.</p>
                <p className="text-sm text-muted-foreground mb-4">
                    It may have been deleted. Pick another task from the list.
                </p>
                <Link href={`/lists/${listId}`} className="text-sm text-foreground underline">
                    Back to list
                </Link>
            </div>
        );
    }

    // Root-first order for the breadcrumb trail
    const ancestors = findAncestors(taskId, flatList).reverse();

    // flatToTree on task + its descendants yields a single rooted subtree —
    // the task's parent (outside this filtered set) is simply not linked, so
    // the task itself becomes the root with `children` already nested.
    const descendantIds = findDescendantIds(taskId, flatList);
    const subtreeFlat = flatList.filter(
        (flatTask) => flatTask.id === taskId || descendantIds.has(flatTask.id),
    );
    const children = flatToTree(subtreeFlat)[0]?.children ?? [];

    const recurringLabel = task.is_recurring ? humanReadableLabel(task.recurrence_rule) : null;

    /** Navigates away from the task just deleted — to its parent, or the list if it was a root task. */
    function handleDeleted() {
        const parentId = ancestors[ancestors.length - 1]?.id;
        router.push(parentId ? `/lists/${listId}/tasks/${parentId}` : `/lists/${listId}`);
    }

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                <Link
                    href={`/lists/${listId}`}
                    className="hover:text-foreground flex items-center gap-1"
                >
                    <ArrowLeft className="h-3 w-3" />
                    List
                </Link>
                {ancestors.map((ancestor) => (
                    <span key={ancestor.id} className="flex items-center gap-1">
                        <span>/</span>
                        <Link
                            href={`/lists/${listId}/tasks/${ancestor.id}`}
                            className="hover:text-foreground truncate max-w-40"
                        >
                            {ancestor.title}
                        </Link>
                    </span>
                ))}
            </div>

            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <h1 className="text-lg font-semibold text-foreground flex-1">{task.title}</h1>
                <TaskRowActions
                    task={task}
                    flatList={flatList}
                    onAddSubtask={() => setAddSubtaskOpen(true)}
                    listId={listId}
                    onDeleted={handleDeleted}
                />
            </div>

            <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge name={task.status_name} color={task.status_color} />
                    {task.is_recurring && (
                        <span className="text-xs text-muted-foreground capitalize">
                            Repeats {recurringLabel}
                        </span>
                    )}
                </div>

                {task.due_date && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Due date</p>
                        <p className="text-sm text-foreground">
                            {format(parseISO(task.due_date), 'EEE, MMM d')}
                        </p>
                    </div>
                )}
            </div>

            {task.description && (
                <p className="text-sm text-foreground whitespace-pre-wrap">{task.description}</p>
            )}

            {/* Subtasks */}
            <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between py-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Subtasks
                    </h2>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setAddSubtaskOpen(true)}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add subtask
                    </Button>
                </div>
                {children.length > 0 ? (
                    <SubtaskTree nodes={children} listId={listId} />
                ) : (
                    <p className="text-sm text-muted-foreground pb-4">No subtasks yet.</p>
                )}
            </div>

            <TaskFormDialog
                open={addSubtaskOpen}
                onClose={() => setAddSubtaskOpen(false)}
                parentId={task.id}
                listId={listId}
            />
        </div>
    );
}
