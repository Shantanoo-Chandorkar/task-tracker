'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Plus } from 'lucide-react';
import { findAncestors, findDescendantIds, flatToTree } from '@/lib/tree';
import { humanReadableLabel } from '@/lib/recurrence';
import { useStatusesQuery } from '@/hooks/useStatusesQuery';
import { useTasksQuery } from '@/hooks/useTasksQuery';
import { useTaskCompletion } from '@/hooks/useTaskCompletion';
import MountOnFirstOpen from '@/components/ui/MountOnFirstOpen';
import CompleteTaskDialog from '@/components/task-list/CompleteTaskDialog';
import { useSpaceIdForList } from '@/hooks/useSpaceIdForList';
import { useSpaceById } from '@/hooks/useSpaceById';
import StatusBadge from '@/components/status/StatusBadge';
import TaskTagPicker from './TaskTagPicker';
import TaskRowActions from '@/components/task-list/TaskRowActions';
import LimitWarning from '@/components/task-list/LimitWarning';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import SubtaskTree from './SubtaskTree';
import { Button } from '@/components/ui/button';
import RichTextRenderer from '@/components/ui/RichTextRenderer';

/**
 * Task detail page content - title, status, description, recurrence, and the subtask tree.
 *
 * @param {object} props
 * @param {string} props.listId - List this task belongs to
 * @param {string} props.taskId - Task being viewed
 * @param {object[]} props.initialTasks - SSR-fetched flat task list for this list (hydrates the query)
 * @param {object[]} [props.initialStatuses] - Seeds the query cache so SubtaskTree's checkboxes don't hydrate-mismatch
 * @param {object[]} [props.initialLists] - SSR-fetched single-list array, so spaceId resolves on first paint
 */
export default function TaskDetail({
    listId,
    taskId,
    initialTasks,
    initialStatuses,
    initialLists,
}) {
    const router = useRouter();
    const [addSubtaskOpen, setAddSubtaskOpen] = useState(false);

    const { data: flatList = [] } = useTasksQuery(listId, { initialData: initialTasks });

    // Seeds the shared ['statuses', spaceId] cache so SubtaskTree's checkboxes don't hydrate-mismatch on mount.
    const spaceId = useSpaceIdForList(listId, { initialData: initialLists });
    useStatusesQuery(spaceId, { initialData: initialStatuses });
    const completion = useTaskCompletion(listId);
    const maxSubtasksPerParent = useSpaceById(spaceId)?.max_subtasks_per_parent ?? null;

    const task = flatList.find((task) => task.id === taskId);

    // Root-first order for the breadcrumb trail
    const ancestors = useMemo(() => findAncestors(taskId, flatList).reverse(), [taskId, flatList]);

    // The task's parent is outside this filtered set, so flatToTree makes the task the root.
    const children = useMemo(() => {
        const descendantIds = findDescendantIds(taskId, flatList);
        const subtreeFlat = flatList.filter(
            (flatTask) => flatTask.id === taskId || descendantIds.has(flatTask.id),
        );
        return flatToTree(subtreeFlat)[0]?.children ?? [];
    }, [taskId, flatList]);

    const canAddSubtask = maxSubtasksPerParent == null || children.length < maxSubtasksPerParent;
    const isOverSubtaskCap = maxSubtasksPerParent != null && children.length > maxSubtasksPerParent;

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

    const recurringLabel = task.is_recurring ? humanReadableLabel(task.recurrence_rule) : null;

    /** Navigates away from the task just deleted - to its parent, or the list if it was a root task. */
    function handleDeleted() {
        const parentId = ancestors[ancestors.length - 1]?.id;
        router.push(parentId ? `/lists/${listId}/tasks/${parentId}` : `/lists/${listId}`);
    }

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb">
                <ol className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                    <li>
                        <Link
                            href={`/lists/${listId}`}
                            className="hover:text-foreground flex items-center gap-1"
                        >
                            <ArrowLeft aria-hidden="true" className="h-3 w-3" />
                            List
                        </Link>
                    </li>
                    {ancestors.map((ancestor) => (
                        <li key={ancestor.id} className="flex items-center gap-1">
                            <span aria-hidden="true">/</span>
                            <Link
                                href={`/lists/${listId}/tasks/${ancestor.id}`}
                                className="hover:text-foreground truncate max-w-40"
                            >
                                {ancestor.title}
                            </Link>
                        </li>
                    ))}
                </ol>
            </nav>

            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <h1 className="text-lg font-semibold text-foreground flex-1 min-w-0 [overflow-wrap:anywhere]">
                    {task.title}
                </h1>
                <TaskRowActions
                    task={task}
                    completion={completion}
                    onAddSubtask={() => setAddSubtaskOpen(true)}
                    canAddSubtask={canAddSubtask}
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

                <TaskTagPicker task={task} spaceId={spaceId} />
            </div>

            <div className="w-full min-w-0">
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                {task.description ? (
                    <RichTextRenderer html={task.description} />
                ) : (
                    <p className="text-sm text-muted-foreground">No description</p>
                )}
            </div>

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
                        disabled={!canAddSubtask}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add subtask
                    </Button>
                </div>
                {isOverSubtaskCap && (
                    <LimitWarning
                        message={`This task has ${children.length} subtasks, over this space's limit of ${maxSubtasksPerParent}. Remove some or raise the limit before adding more.`}
                    />
                )}
                {children.length > 0 ? (
                    <SubtaskTree nodes={children} listId={listId} flatList={flatList} />
                ) : (
                    <p className="text-sm text-muted-foreground pb-4">No subtasks yet.</p>
                )}
            </div>

            <MountOnFirstOpen open={addSubtaskOpen}>
                <TaskFormDialog
                    open={addSubtaskOpen}
                    onClose={() => setAddSubtaskOpen(false)}
                    parentId={task.id}
                    listId={listId}
                />
            </MountOnFirstOpen>

            {/* Cascade confirmation for the actions menu's Mark as complete */}
            <MountOnFirstOpen open={completion.completeDialogProps.open}>
                <CompleteTaskDialog {...completion.completeDialogProps} />
            </MountOnFirstOpen>
        </div>
    );
}
