'use client';

import { Fragment, useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical, Plus, MoreHorizontal } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import ModalShell from '@/components/ui/modal-shell';
import { flatToTree, findDescendantIds, isStartOfUnprioritisedTier } from '@/lib/tree';
import { useUIState } from '@/providers/UIStateProvider';
import { useStatusesQuery } from '@/hooks/useStatusesQuery';
import { useSpaceIdForList } from '@/hooks/useSpaceIdForList';
import { useSublistsQuery } from '@/hooks/useSublistsQuery';
import { usePermissionForSpace } from '@/hooks/usePermissionForSpace';
import { duplicateTask } from '@/actions/task-actions';
import { updateSublist, deleteSublist } from '@/actions/sublist-actions';
import TaskRow, { PriorityTierDivider } from './TaskRow';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import SublistFormDialog from '@/components/space/SublistFormDialog';
import StatusCountTiles from './StatusCountTiles';
import VelocityMeter from './VelocityMeter';
import ListHeader from './ListHeader';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { bustPageCache } from '@/lib/service-worker-cache';

// Module-level so dnd-kit's internal useSensor memoization sees a stable options reference.
const MOUSE_ACTIVATION = { distance: 5 };
const TOUCH_ACTIVATION = { delay: 200, tolerance: 8 };

/**
 * Collision detection scoped to the dragged row's own siblings (parent_id + sublist_id) and priority tier.
 * Sublist headers fall back to plain closestCenter - they're already one flat list.
 *
 * @param {object} args - dnd-kit collision detection arguments
 * @returns {object[]} Collisions, scoped to siblings when possible
 */
function siblingScopedCollisionDetection(args) {
    if (args.active?.data?.current?.type === 'sublist') {
        return closestCenter(args);
    }

    const activeData = args.active?.data?.current ?? {};
    const activeParentId = activeData.parentId ?? null;
    const activeSublistId = activeData.sublistId ?? null;
    const activeIsPrioritised = activeData.isPrioritised ?? false;
    const siblingContainers = args.droppableContainers.filter((container) => {
        const containerData = container.data.current ?? {};
        return (
            (containerData.parentId ?? null) === activeParentId &&
            (containerData.sublistId ?? null) === activeSublistId &&
            (containerData.isPrioritised ?? false) === activeIsPrioritised
        );
    });

    const siblingCollisions = closestCenter({ ...args, droppableContainers: siblingContainers });
    return siblingCollisions.length > 0 ? siblingCollisions : closestCenter(args);
}

/**
 * Renders one status group (header + rows + add-task link) for a bucket of root tasks.
 * Shared by the direct bucket and every sublist bucket so both group identically.
 *
 * @param {object} props
 * @param {object} props.status - Status this group renders, or null for "No Status"
 * @param {object[]} props.tasks - Root tasks in this status, already filtered to this bucket
 * @param {number} [props.count] - Displayed count including subtasks (`tasks.length` is root-only)
 * @param {boolean} props.isCollapsed
 * @param {Function} props.onToggle
 * @param {object[]} props.flatList
 * @param {string} props.listId
 * @param {Function} props.onAddTask - Called to open task creation for this status
 * @param {Function} props.onFocusTask - Called with a task's id when its row is clicked
 * @param {boolean} props.canWrite - Whether the caller may create tasks (false for read-only collaborators)
 * @param {string|null} props.currentUserId - Caller's user id, for row-level ownership checks
 * @param {'owner'|'full'|'restricted'|'read_only'|null} props.myPermission - Caller's tier for this space
 */
function StatusGroup({
    status,
    tasks,
    count,
    isCollapsed,
    onToggle,
    flatList,
    listId,
    onAddTask,
    onFocusTask,
    canWrite,
    currentUserId,
    myPermission,
}) {
    if (tasks.length === 0) return null;

    return (
        <section className="space-y-0.5 pl-4 md:pl-8 [--row-indent:8px] md:[--row-indent:24px]">
            <button
                className="flex items-center gap-2 w-full py-2 text-left group/header"
                onClick={onToggle}
            >
                {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                {status && (
                    <span
                        className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: status.color }}
                    />
                )}
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {status ? status.name : 'No Status'}
                </span>
                <span className="text-xs text-muted-foreground/60">({count ?? tasks.length})</span>
            </button>

            <div className="border-b border-border/50 mb-2" />

            {!isCollapsed && (
                <>
                    <SortableContext
                        items={tasks.map((task) => task.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {tasks.map((task, taskIndex) => (
                            <Fragment key={task.id}>
                                {isStartOfUnprioritisedTier(tasks, taskIndex) && <PriorityTierDivider />}
                                <div onClick={() => onFocusTask(task.id)}>
                                    <TaskRow
                                        task={task}
                                        depth={0}
                                        flatList={flatList}
                                        listId={listId}
                                        currentUserId={currentUserId}
                                        myPermission={myPermission}
                                    />
                                </div>
                            </Fragment>
                        ))}
                    </SortableContext>

                    {canWrite && (
                        <button
                            className="flex items-center gap-1.5 px-8 py-1.5 rounded-md text-xs text-muted-foreground/60 hover:text-foreground hover:bg-muted motion-safe:transition-colors w-full text-left"
                            onClick={onAddTask}
                        >
                            <Plus className="h-3 w-3" />
                            Add Task
                        </button>
                    )}
                </>
            )}
        </section>
    );
}

/**
 * Builds the "N STATUS · N STATUS" summary shown on a sublist header, most populous status first.
 *
 * @param {Map<string, number>} countsByStatusId - Task count per status id, any depth
 * @param {object[]} statuses - Statuses with at least id/name
 * @returns {string} Summary text, empty when the bucket has no status-tagged tasks
 */
function describeBucketBreakdown(countsByStatusId, statuses) {
    return statuses
        .map((status) => ({ name: status.name, count: countsByStatusId.get(status.id) ?? 0 }))
        .filter((entry) => entry.count > 0)
        .sort((a, b) => b.count - a.count)
        .map((entry) => `${entry.count} ${entry.name.toUpperCase()}`)
        .join(' · ');
}

/**
 * Collapsible sublist section header - drag handle, color swatch, name, status breakdown, edit, delete.
 *
 * @param {object} props
 * @param {object} props.sublist
 * @param {number} props.taskCount
 * @param {string} props.breakdownText
 * @param {boolean} props.isCollapsed
 * @param {Function} props.onToggle
 * @param {Function} props.onEdit
 * @param {Function} props.onDelete
 */
function SublistHeader({
    sublist,
    taskCount,
    breakdownText,
    isCollapsed,
    onToggle,
    onEdit,
    onDelete,
    onAddTask,
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: sublist.id,
        data: { type: 'sublist' },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-1.5 rounded-lg bg-card px-3 py-2.5 group/sublist"
        >
            <button
                {...listeners}
                {...attributes}
                className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0 p-3 -m-3"
                aria-label="Drag to reorder"
            >
                <GripVertical className="h-3.5 w-3.5" />
            </button>
            <button className="flex items-center gap-2 flex-1 min-w-0 text-left" onClick={onToggle}>
                {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: sublist.color }}
                />
                <span className="text-sm font-semibold text-foreground truncate">{sublist.name}</span>
                <span className="text-xs text-muted-foreground/60 flex-shrink-0">({taskCount})</span>
            </button>

            {breakdownText && (
                <span className="hidden sm:block flex-shrink-0 text-xs text-muted-foreground">
                    {breakdownText}
                </span>
            )}

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label="Sublist actions"
                    >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                    <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={onAddTask}>Add task</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={onDelete}
                        className="text-destructive focus:text-destructive"
                    >
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

/**
 * Root task list - groups root tasks by sublist, then by status, all collapsible.
 * Handles DnD reordering (tasks and sublists) and the Ctrl+D duplicate shortcut.
 *
 * @param {object} props
 * @param {string} props.listId - The list this task tree belongs to
 * @param {object[]} props.initialTasks - SSR-fetched flat task list (hydrates TanStack Query)
 * @param {object[]} props.initialStatuses - SSR-fetched statuses (hydrates TanStack Query)
 * @param {object[]} [props.initialSpaces] - SSR-fetched spaces, passed through to ListHeader
 * @param {object[]} [props.initialLists] - SSR-fetched lists, passed through to ListHeader
 * @param {object[]} [props.initialSublists] - SSR-fetched sublists for this list
 * @param {string|null} [props.currentUserId] - Caller's user id, for row-level ownership checks
 */
export default function TaskList({
    listId,
    initialTasks,
    initialStatuses,
    initialSpaces,
    initialLists,
    initialSublists,
    currentUserId,
}) {
    const queryClient = useQueryClient();

    // Every mutation below only ever affects this one page - one shared bust target.
    function bustThisListPage() {
        bustPageCache({ urls: [`/lists/${listId}`] });
    }

    const [focusedTaskId, setFocusedTaskId] = useState(null);
    const [createDialog, setCreateDialog] = useState({ open: false, parentId: null, sublistId: null });
    const { flags: collapsedGroups, toggleFlag: toggleGroup } = useUIState();
    const [activeStatusId, setActiveStatusId] = useState(null);
    const [sublistDialog, setSublistDialog] = useState({ open: false, sublist: null });
    const [deleteSublistTarget, setDeleteSublistTarget] = useState(null);
    const [deletingSublist, setDeletingSublist] = useState(false);

    const { data: flatList = [] } = useQuery({
        queryKey: ['tasks', listId],
        queryFn: async () => {
            const response = await fetch(`/api/tasks?list_id=${listId}`);
            if (!response.ok) throw new Error('Failed to fetch tasks');
            return response.json();
        },
        initialData: initialTasks,
    });

    const spaceId = useSpaceIdForList(listId, { initialData: initialLists });
    const { data: statuses = [] } = useStatusesQuery(spaceId, { initialData: initialStatuses });

    const { data: sublists = [] } = useSublistsQuery(listId, { initialData: initialSublists });

    // A UX hint only - RLS and the app-layer pre-checks are the real backstop if a control is missed.
    const myPermission = usePermissionForSpace(spaceId, { initialData: initialSpaces });
    const canWrite = myPermission !== 'read_only';

    const tree = useMemo(() => flatToTree(flatList), [flatList]);
    const rootTasks = tree; // flatToTree already returns only root nodes

    // Counts include every depth, not just root tasks - a subtask's status can differ from its parent's.
    const countsByStatusId = useMemo(() => {
        const nextCountsByStatusId = {};
        for (const status of statuses) {
            nextCountsByStatusId[status.id] = flatList.filter((task) => task.status_id === status.id).length;
        }
        return nextCountsByStatusId;
    }, [statuses, flatList]);

    function handleSelectStatus(statusId) {
        setActiveStatusId((prev) => (prev === statusId ? null : statusId));
    }

    const doneStatus = statuses.find((status) => status.code === 'done');
    const completedCount = doneStatus ? (countsByStatusId[doneStatus.id] ?? 0) : 0;

    // Grouped via a single Map pass per bucket instead of a filter-per-status - O(n), not O(n·statuses).
    const buckets = useMemo(() => {
        function rootMatchesActiveStatus(rootTask) {
            if (!activeStatusId) return true;
            if (rootTask.status_id === activeStatusId) return true;
            const descendantIds = findDescendantIds(rootTask.id, flatList);
            return flatList.some(
                (task) => descendantIds.has(task.id) && task.status_id === activeStatusId,
            );
        }

        function groupByStatus(tasks) {
            const tasksByStatusId = new Map();
            for (const task of tasks) {
                const key = task.status_id ?? 'none';
                if (!tasksByStatusId.has(key)) tasksByStatusId.set(key, []);
                tasksByStatusId.get(key).push(task);
            }
            return tasksByStatusId;
        }

        // Totals include every descendant - a root task's own subtasks belong to its sublist too.
        function countAllDepth(rootTasksInBucket) {
            let total = rootTasksInBucket.length;
            const countsByStatusId = new Map();
            function tally(task) {
                const key = task.status_id ?? 'none';
                countsByStatusId.set(key, (countsByStatusId.get(key) ?? 0) + 1);
            }
            for (const rootTask of rootTasksInBucket) {
                tally(rootTask);
                const descendantIds = findDescendantIds(rootTask.id, flatList);
                total += descendantIds.size;
                for (const task of flatList) {
                    if (descendantIds.has(task.id)) tally(task);
                }
            }
            return { total, countsByStatusId };
        }

        const bucketedRootTasks = activeStatusId
            ? rootTasks.filter(rootMatchesActiveStatus)
            : rootTasks;
        const directTasks = bucketedRootTasks.filter((task) => !task.sublist_id);
        const directAllDepth = countAllDepth(directTasks);

        return [
            {
                key: 'direct',
                sublist: null,
                tasks: directTasks,
                tasksByStatusId: groupByStatus(directTasks),
                allDepthCount: directAllDepth.total,
                allDepthCountsByStatusId: directAllDepth.countsByStatusId,
            },
            ...sublists.map((sublist) => {
                const sublistTasks = bucketedRootTasks.filter((task) => task.sublist_id === sublist.id);
                const sublistAllDepth = countAllDepth(sublistTasks);
                return {
                    key: sublist.id,
                    sublist,
                    tasks: sublistTasks,
                    tasksByStatusId: groupByStatus(sublistTasks),
                    allDepthCount: sublistAllDepth.total,
                    allDepthCountsByStatusId: sublistAllDepth.countsByStatusId,
                };
            }),
        ];
    }, [rootTasks, sublists, activeStatusId, flatList]);

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: MOUSE_ACTIVATION }),
        // Touch needs its own sensor (not PointerSensor, which would race with it): a short
        // delay + move tolerance lets a tap or scroll happen without being grabbed as a drag.
        useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    async function handleTaskDragEnd({ active, over }) {
        const activeTask = flatList.find((task) => task.id === active.id);
        if (!activeTask) return;

        // flatList is ordered by (depth, position), so same-(parent, sublist) tasks stay in
        // relative order here - no separate sibling lookup, and non-root tasks always have sublist_id null.
        const siblingIds = flatList
            .filter(
                (task) =>
                    task.parent_id === activeTask.parent_id &&
                    (task.sublist_id ?? null) === (activeTask.sublist_id ?? null),
            )
            .map((task) => task.id);
        // Reordering is per tier; changing tier is done with the star, so a cross-tier drop is ignored.
        const overTask = flatList.find((task) => task.id === over.id);
        if (Boolean(overTask?.is_prioritised) !== Boolean(activeTask.is_prioritised)) return;

        const oldIndex = siblingIds.indexOf(active.id);
        const newIndex = siblingIds.indexOf(over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        // Downward drags insert after the target; upward drags insert before it (after the prior sibling).
        // shouldPrependToStart marks landing at index 0, since afterSiblingId: null already means "append at end".
        const isMovingToStart = newIndex === 0;
        const afterSiblingId = oldIndex < newIndex ? over.id : (siblingIds[newIndex - 1] ?? null);

        // Optimistic reorder - lands in the new slot immediately, without waiting on the persist round-trip.
        const reorderedSiblingIds = arrayMove(siblingIds, oldIndex, newIndex);
        queryClient.setQueryData(['tasks', listId], (current) => {
            const currentTasks = current ?? flatList;
            const tasksById = new Map(currentTasks.map((task) => [task.id, task]));
            const reorderedSiblings = reorderedSiblingIds.map((taskId) => tasksById.get(taskId));
            let siblingCursor = 0;
            return currentTasks.map((task) =>
                task.parent_id === activeTask.parent_id &&
                (task.sublist_id ?? null) === (activeTask.sublist_id ?? null)
                    ? reorderedSiblings[siblingCursor++]
                    : task,
            );
        });

        const toastId = toast.loading('Saving order...');

        try {
            const response = await fetch(`/api/tasks/${active.id}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    newParentId: activeTask.parent_id ?? null,
                    sublistId: activeTask.parent_id ? undefined : (activeTask.sublist_id ?? null),
                    afterSiblingId,
                    shouldPrependToStart: isMovingToStart,
                    listId,
                }),
            });

            if (!response.ok) {
                console.error('Drag reorder failed');
                toast.error('Failed to reorder task', { id: toastId });
                await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
                bustThisListPage();
                return;
            }

            await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
            bustThisListPage();
            toast.success('Order updated', { id: toastId });
        } catch (caughtError) {
            console.error('Drag reorder failed:', caughtError);
            toast.error('Failed to reorder task', { id: toastId });
            await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
            bustThisListPage();
        }
    }

    async function handleSublistDragEnd({ active, over }) {
        const oldIndex = sublists.findIndex((sublist) => sublist.id === active.id);
        const newIndex = sublists.findIndex((sublist) => sublist.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(sublists, oldIndex, newIndex);
        queryClient.setQueryData(['sublists', listId], reordered);

        const toastId = toast.loading('Saving order...');
        try {
            const results = await Promise.all(
                reordered
                    .map((sublist, newPosition) => ({ sublist, newPosition }))
                    .filter(({ sublist, newPosition }) => sublist.position !== newPosition)
                    .map(({ sublist, newPosition }) => updateSublist(sublist.id, { position: newPosition })),
            );
            const failed = results.find((updateOutcome) => updateOutcome.error);
            if (failed) {
                toast.error(failed.error, { id: toastId });
                await queryClient.invalidateQueries({ queryKey: ['sublists', listId] });
                bustThisListPage();
                return;
            }
            await queryClient.invalidateQueries({ queryKey: ['sublists', listId] });
            bustThisListPage();
            toast.success('Order updated', { id: toastId });
        } catch (caughtError) {
            console.error('Sublist reorder failed:', caughtError);
            toast.error('Failed to reorder sublist', { id: toastId });
            await queryClient.invalidateQueries({ queryKey: ['sublists', listId] });
            bustThisListPage();
        }
    }

    function handleDragEnd({ active, over }) {
        if (!over || active.id === over.id) return;
        if (active.data.current?.type === 'sublist') {
            return handleSublistDragEnd({ active, over });
        }
        return handleTaskDragEnd({ active, over });
    }

    // Ctrl/Cmd+D duplicates whichever task row was last clicked/focused
    useEffect(() => {
        function handleKeyDown(keyboardEvent) {
            const isCtrl = keyboardEvent.ctrlKey || keyboardEvent.metaKey;
            if (!isCtrl || keyboardEvent.key !== 'd' || !focusedTaskId) return;

            keyboardEvent.preventDefault();
            duplicateTask(focusedTaskId).then(({ error }) => {
                if (error) {
                    toast.error(error);
                    return;
                }
                queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
                queryClient.invalidateQueries({ queryKey: ['lists'] });
                bustPageCache({ urls: [`/lists/${listId}`] });
                toast.success('Task duplicated');
            });
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedTaskId, listId, queryClient]);

    async function requestDeleteSublist(sublist) {
        const response = await fetch(`/api/sublists/${sublist.id}`);
        const counts = await response.json();
        setDeleteSublistTarget({
            id: sublist.id,
            name: sublist.name,
            taskCount: response.ok ? counts.task_count : null,
        });
    }

    async function handleConfirmDeleteSublist() {
        if (!deleteSublistTarget) return;

        setDeletingSublist(true);
        const toastId = toast.loading('Deleting sublist...');
        const { error } = await deleteSublist(deleteSublistTarget.id);
        setDeletingSublist(false);
        setDeleteSublistTarget(null);

        if (error) {
            toast.error(error, { id: toastId });
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['sublists', listId] });
        await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
        // Deleting a sublist cascades to delete all its tasks, changing the list's total count.
        queryClient.invalidateQueries({ queryKey: ['lists'] });
        bustThisListPage();
        toast.success('Sublist deleted', { id: toastId });
    }

    if (flatList.length === 0 && sublists.length === 0) {
        return (
            <>
                <ListHeader
                    listId={listId}
                    initialSpaces={initialSpaces}
                    initialLists={initialLists}
                />
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 sm:py-24 text-center">
                    <p className="text-muted-foreground text-sm mb-4">
                        No tasks yet. Add your first task to get started.
                    </p>
                    {canWrite && (
                        <Button
                            onClick={() =>
                                setCreateDialog({ open: true, parentId: null, sublistId: null })
                            }
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            New Task
                        </Button>
                    )}
                </div>
                <TaskFormDialog
                    open={createDialog.open}
                    onClose={() => setCreateDialog({ open: false, parentId: null, sublistId: null })}
                    parentId={createDialog.parentId}
                    listId={listId}
                />
            </>
        );
    }

    return (
        <DndContext
            id="task-list-dnd"
            sensors={sensors}
            collisionDetection={siblingScopedCollisionDetection}
            onDragEnd={handleDragEnd}
        >
            <div className="space-y-6">
                <ListHeader
                    listId={listId}
                    initialSpaces={initialSpaces}
                    initialLists={initialLists}
                >
                    {doneStatus && (
                        <VelocityMeter completedCount={completedCount} totalCount={flatList.length} />
                    )}
                </ListHeader>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <StatusCountTiles
                        statuses={statuses}
                        countsByStatusId={countsByStatusId}
                        totalCount={flatList.length}
                        activeStatusId={activeStatusId}
                        onSelect={handleSelectStatus}
                    />
                </div>

                <SortableContext
                    items={sublists.map((sublist) => sublist.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {buckets.map((bucket) => {
                        const bucketHasTasks = bucket.tasks.length > 0;
                        if (bucket.sublist && !bucketHasTasks) {
                            const isCollapsed = collapsedGroups[`sublist:${bucket.sublist.id}`];
                            return (
                                <div key={bucket.key}>
                                    <SublistHeader
                                        sublist={bucket.sublist}
                                        taskCount={0}
                                        isCollapsed={isCollapsed}
                                        onToggle={() => toggleGroup(`sublist:${bucket.sublist.id}`)}
                                        onEdit={() =>
                                            setSublistDialog({ open: true, sublist: bucket.sublist })
                                        }
                                        onDelete={() => requestDeleteSublist(bucket.sublist)}
                                        onAddTask={() =>
                                            setCreateDialog({
                                                open: true,
                                                parentId: null,
                                                sublistId: bucket.sublist.id,
                                            })
                                        }
                                    />
                                    {!isCollapsed && canWrite && (
                                        <button
                                            className="flex items-center gap-1.5 ml-4 md:ml-8 mr-2 my-0.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground/60 hover:text-foreground hover:bg-muted motion-safe:transition-colors"
                                            onClick={() =>
                                                setCreateDialog({
                                                    open: true,
                                                    parentId: null,
                                                    sublistId: bucket.sublist.id,
                                                })
                                            }
                                        >
                                            <Plus className="h-3 w-3" />
                                            Add Task
                                        </button>
                                    )}
                                </div>
                            );
                        }
                        if (!bucketHasTasks) return null;

                        const isSublistCollapsed = bucket.sublist
                            ? collapsedGroups[`sublist:${bucket.sublist.id}`]
                            : false;

                        return (
                            <div key={bucket.key} className="space-y-0.5">
                                {bucket.sublist && (
                                    <SublistHeader
                                        sublist={bucket.sublist}
                                        taskCount={bucket.allDepthCount}
                                        breakdownText={describeBucketBreakdown(bucket.allDepthCountsByStatusId, statuses)}
                                        isCollapsed={isSublistCollapsed}
                                        onToggle={() => toggleGroup(`sublist:${bucket.sublist.id}`)}
                                        onEdit={() =>
                                            setSublistDialog({ open: true, sublist: bucket.sublist })
                                        }
                                        onDelete={() => requestDeleteSublist(bucket.sublist)}
                                        onAddTask={() =>
                                            setCreateDialog({
                                                open: true,
                                                parentId: null,
                                                sublistId: bucket.sublist.id,
                                            })
                                        }
                                    />
                                )}
                                {!isSublistCollapsed && (
                                    <>
                                        {statuses.map((status) => (
                                            <StatusGroup
                                                key={status.id}
                                                status={status}
                                                tasks={bucket.tasksByStatusId.get(status.id) ?? []}
                                                count={bucket.allDepthCountsByStatusId.get(status.id) ?? 0}
                                                isCollapsed={
                                                    collapsedGroups[`${bucket.key}:${status.id}`]
                                                }
                                                onToggle={() => toggleGroup(`${bucket.key}:${status.id}`)}
                                                flatList={flatList}
                                                listId={listId}
                                                onFocusTask={setFocusedTaskId}
                                                onAddTask={() =>
                                                    setCreateDialog({
                                                        open: true,
                                                        parentId: null,
                                                        statusId: status.id,
                                                        sublistId: bucket.sublist?.id ?? null,
                                                    })
                                                }
                                                canWrite={canWrite}
                                                currentUserId={currentUserId}
                                                myPermission={myPermission}
                                            />
                                        ))}
                                        <StatusGroup
                                            status={null}
                                            tasks={bucket.tasksByStatusId.get('none') ?? []}
                                            count={bucket.allDepthCountsByStatusId.get('none') ?? 0}
                                            isCollapsed={collapsedGroups[`${bucket.key}:none`]}
                                            onToggle={() => toggleGroup(`${bucket.key}:none`)}
                                            flatList={flatList}
                                            listId={listId}
                                            onFocusTask={setFocusedTaskId}
                                            onAddTask={() =>
                                                setCreateDialog({
                                                    open: true,
                                                    parentId: null,
                                                    sublistId: bucket.sublist?.id ?? null,
                                                })
                                            }
                                            canWrite={canWrite}
                                            currentUserId={currentUserId}
                                            myPermission={myPermission}
                                        />
                                    </>
                                )}
                            </div>
                        );
                    })}
                </SortableContext>

                {canWrite && (
                    <button
                        type="button"
                        onClick={() => setSublistDialog({ open: true, sublist: null })}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/50 motion-safe:transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        Create New Sublist
                    </button>
                )}
            </div>

            {/* Create task dialog */}
            <TaskFormDialog
                open={createDialog.open}
                onClose={() => setCreateDialog({ open: false, parentId: null, sublistId: null })}
                parentId={createDialog.parentId ?? null}
                defaultStatusId={createDialog.statusId ?? null}
                defaultSublistId={createDialog.sublistId ?? null}
                listId={listId}
            />

            {/* Create/edit sublist dialog */}
            <SublistFormDialog
                open={sublistDialog.open}
                onClose={() => setSublistDialog({ open: false, sublist: null })}
                sublist={sublistDialog.sublist}
                listId={listId}
            />

            {/* Delete sublist confirmation */}
            <ModalShell
                open={!!deleteSublistTarget}
                onClose={() => setDeleteSublistTarget(null)}
                variant="alert"
                title={<>Delete &ldquo;{deleteSublistTarget?.name}&rdquo;?</>}
                description={
                    deleteSublistTarget?.taskCount != null
                        ? `This deletes ${deleteSublistTarget.taskCount} task${deleteSublistTarget.taskCount !== 1 ? 's' : ''} inside it. This cannot be undone.`
                        : 'This cannot be undone.'
                }
                footer={
                    <>
                        <AlertDialogCancel onClick={() => setDeleteSublistTarget(null)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDeleteSublist}
                            disabled={deletingSublist}
                            className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deletingSublist && <Loader size="xs" />}
                            Delete
                        </AlertDialogAction>
                    </>
                }
            />
        </DndContext>
    );
}
