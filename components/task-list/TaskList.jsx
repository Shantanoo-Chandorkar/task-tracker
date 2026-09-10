'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { flatToTree, findDescendantIds } from '@/lib/tree';
import { useClipboard } from '@/hooks/useClipboard';
import TaskRow from './TaskRow';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import StatusBadge from '@/components/status/StatusBadge';
import StatusCountTiles from './StatusCountTiles';
import ListHeader from './ListHeader';
import { Button } from '@/components/ui/button';

/**
 * Collision detection scoped to the dragged row's own siblings (same
 * `parent_id`) before falling back to a plain closestCenter. Plain
 * closestCenter alone resolves `over` across the *entire* tree — including
 * rows outside the dragged task's sibling set — which then fails
 * `handleDragEnd`'s sibling-index lookup and silently no-ops. This is what
 * made subtask reordering (nested one level inside a root-level
 * SortableContext) unreliable while root-level reordering mostly worked.
 *
 * @param {object} args - dnd-kit collision detection arguments
 * @returns {object[]} Collisions, scoped to siblings when possible
 */
function siblingScopedCollisionDetection(args) {
    const activeParentId = args.active?.data?.current?.parentId ?? null;
    const siblingContainers = args.droppableContainers.filter(
        (container) => (container.data.current?.parentId ?? null) === activeParentId,
    );

    const siblingCollisions = closestCenter({ ...args, droppableContainers: siblingContainers });
    return siblingCollisions.length > 0 ? siblingCollisions : closestCenter(args);
}

/**
 * Root task list container.
 * Groups root-level tasks by status with collapsible section headers.
 * Provides DnD context for sibling reordering within each status group.
 * Registers global keyboard shortcuts for clipboard operations (Ctrl+C/X/V).
 *
 * @param {object} props
 * @param {string} props.listId - The list this task tree belongs to
 * @param {object[]} props.initialTasks - SSR-fetched flat task list (hydrates TanStack Query)
 * @param {object[]} props.initialStatuses - SSR-fetched statuses (hydrates TanStack Query)
 * @param {object[]} [props.initialSpaces] - SSR-fetched spaces, passed through to ListHeader
 * @param {object[]} [props.initialLists] - SSR-fetched lists, passed through to ListHeader
 */
export default function TaskList({
    listId,
    initialTasks,
    initialStatuses,
    initialSpaces,
    initialLists,
}) {
    const queryClient = useQueryClient();
    const { clipboard, copyTask, cutTask, pasteTask } = useClipboard();

    const [focusedTaskId, setFocusedTaskId] = useState(null);
    const [createDialog, setCreateDialog] = useState({ open: false, parentId: null });
    const [collapsedGroups, setCollapsedGroups] = useState({});
    const [activeStatusId, setActiveStatusId] = useState(null);

    const { data: flatList = [] } = useQuery({
        queryKey: ['tasks', listId],
        queryFn: async () => {
            const response = await fetch(`/api/tasks?list_id=${listId}`);
            if (!response.ok) throw new Error('Failed to fetch tasks');
            return response.json();
        },
        initialData: initialTasks,
    });

    const { data: statuses = [] } = useQuery({
        queryKey: ['statuses'],
        queryFn: async () => {
            const response = await fetch('/api/statuses');
            if (!response.ok) throw new Error('Failed to fetch statuses');
            return response.json();
        },
        initialData: initialStatuses,
    });

    const tree = flatToTree(flatList);
    const rootTasks = tree; // flatToTree already returns only root nodes

    const tasksByStatus = {};
    for (const status of statuses) {
        tasksByStatus[status.id] = rootTasks.filter((task) => task.status_id === status.id);
    }
    const unstatedTasks = rootTasks.filter((task) => !task.status_id);

    // Counts include every task at every depth, not just root tasks — a
    // subtask can carry a different status than its root parent, and the
    // tile numeral should be a trustworthy inventory count regardless (same
    // convention ClickUp's own list-header counts use).
    const countsByStatusId = {};
    for (const status of statuses) {
        countsByStatusId[status.id] = flatList.filter(
            (task) => task.status_id === status.id,
        ).length;
    }

    function handleSelectStatus(statusId) {
        setActiveStatusId((prev) => (prev === statusId ? null : statusId));
    }

    /**
     * A root task stays visible under an active status-tile filter if it or
     * any of its descendants carries that status — otherwise a subtask whose
     * status contributed to the tile's count would vanish when filtered.
     *
     * @param {object} rootTask - Root-level task node
     * @returns {boolean} Whether this root should render under the current filter
     */
    function rootMatchesActiveStatus(rootTask) {
        if (!activeStatusId) return true;
        if (rootTask.status_id === activeStatusId) return true;
        const descendantIds = findDescendantIds(rootTask.id, flatList);
        return flatList.some(
            (task) => descendantIds.has(task.id) && task.status_id === activeStatusId,
        );
    }

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    async function handleDragEnd({ active, over }) {
        if (!over || active.id === over.id) return;

        const activeTask = flatList.find((task) => task.id === active.id);
        if (!activeTask) return;

        // flatList is globally ordered by (depth, position), so same-parent tasks stay
        // in relative position order within it — no separate sibling lookup needed.
        const siblingIds = flatList
            .filter((task) => task.parent_id === activeTask.parent_id)
            .map((task) => task.id);
        const oldIndex = siblingIds.indexOf(active.id);
        const newIndex = siblingIds.indexOf(over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        // Dragging down should land the task right after the drop target; dragging up
        // should land it right before the target (i.e. after whichever sibling is now
        // just above it). Always inserting "after over" only gets the down case right —
        // that's exactly why dragging upward silently failed to reorder before.
        // When it lands before every other sibling there's no "after" id at all, so
        // `shouldPrependToStart` tells the API explicitly to insert at the very start —
        // a plain `afterSiblingId: null` already means "append at the end" for other
        // callers (promote, move-to, paste), so it can't double as "insert at the
        // start" here.
        const isMovingToStart = newIndex === 0;
        const afterSiblingId = oldIndex < newIndex ? over.id : (siblingIds[newIndex - 1] ?? null);

        // Optimistic reorder so the row lands in its new slot immediately, instead of
        // waiting on the persist round-trip to feel snappy.
        const reorderedSiblingIds = arrayMove(siblingIds, oldIndex, newIndex);
        queryClient.setQueryData(['tasks', listId], (current) => {
            const list = current ?? flatList;
            const tasksById = new Map(list.map((task) => [task.id, task]));
            const reorderedSiblings = reorderedSiblingIds.map((id) => tasksById.get(id));
            let siblingCursor = 0;
            return list.map((task) =>
                task.parent_id === activeTask.parent_id ? reorderedSiblings[siblingCursor++] : task,
            );
        });

        const toastId = toast.loading('Saving order...');

        try {
            const response = await fetch(`/api/tasks/${active.id}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    newParentId: activeTask.parent_id ?? null,
                    afterSiblingId,
                    shouldPrependToStart: isMovingToStart,
                    listId,
                }),
            });

            if (!response.ok) {
                console.error('Drag reorder failed');
                toast.error('Failed to reorder task', { id: toastId });
                await queryClient.invalidateQueries({ queryKey: ['tasks'] });
                return;
            }

            await queryClient.invalidateQueries({ queryKey: ['tasks'] });
            toast.dismiss(toastId);
        } catch (err) {
            console.error('Drag reorder failed:', err);
            toast.error('Failed to reorder task', { id: toastId });
            await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }
    }

    // Clipboard shortcuts act on whichever task row was last clicked/focused
    useEffect(() => {
        function handleKeyDown(e) {
            const isCtrl = e.ctrlKey || e.metaKey;
            if (!isCtrl) return;

            if (e.key === 'c' && focusedTaskId) {
                e.preventDefault();
                copyTask(focusedTaskId, flatList);
            } else if (e.key === 'x' && focusedTaskId) {
                e.preventDefault();
                cutTask(focusedTaskId, flatList);
            } else if (e.key === 'v' && clipboard.mode) {
                e.preventDefault();
                pasteTask(focusedTaskId ?? null, queryClient, listId);
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedTaskId, flatList, clipboard, copyTask, cutTask, pasteTask, queryClient, listId]);

    function toggleGroup(statusId) {
        setCollapsedGroups((prev) => ({ ...prev, [statusId]: !prev[statusId] }));
    }

    if (flatList.length === 0) {
        return (
            <>
                <ListHeader
                    listId={listId}
                    initialSpaces={initialSpaces}
                    initialLists={initialLists}
                />
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <p className="text-muted-foreground text-sm mb-4">
                        No tasks yet. Add your first task to get started.
                    </p>
                    <Button onClick={() => setCreateDialog({ open: true, parentId: null })}>
                        <Plus className="h-4 w-4 mr-1" />
                        New Task
                    </Button>
                </div>
                <TaskFormDialog
                    open={createDialog.open}
                    onClose={() => setCreateDialog({ open: false, parentId: null })}
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
                />

                <StatusCountTiles
                    statuses={statuses}
                    countsByStatusId={countsByStatusId}
                    activeStatusId={activeStatusId}
                    onSelect={handleSelectStatus}
                />

                {/* Every status section stays visible while a count tile filters the list —
                    within it, only root tasks that match the filter (directly or via a
                    descendant) render, so a matching subtask never vanishes just because its
                    root parent belongs to a different status section */}
                {statuses.map((status) => {
                    const allTasks = tasksByStatus[status.id] ?? [];
                    const tasks = activeStatusId
                        ? allTasks.filter(rootMatchesActiveStatus)
                        : allTasks;
                    if (tasks.length === 0) return null;
                    const isCollapsed = collapsedGroups[status.id];

                    return (
                        <section key={status.id} className="space-y-0.5">
                            {/* Status group header */}
                            <button
                                className="flex items-center gap-2 w-full py-2 text-left group/header"
                                onClick={() => toggleGroup(status.id)}
                            >
                                {isCollapsed ? (
                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <span
                                    className="h-2 w-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: status.color }}
                                />
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    {status.name}
                                </span>
                                <span className="text-xs text-muted-foreground/60">
                                    ({tasks.length})
                                </span>
                            </button>

                            <div className="border-b border-border/50 mb-2" />

                            {/* Task rows for this status group */}
                            {!isCollapsed && (
                                <>
                                    <SortableContext
                                        items={tasks.map((task) => task.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        {tasks.map((task) => (
                                            <div
                                                key={task.id}
                                                onClick={() => setFocusedTaskId(task.id)}
                                            >
                                                <TaskRow
                                                    task={task}
                                                    depth={0}
                                                    flatList={flatList}
                                                    listId={listId}
                                                />
                                            </div>
                                        ))}
                                    </SortableContext>

                                    {/* Add task to this status group */}
                                    <button
                                        className="flex items-center gap-1.5 px-8 py-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground motion-safe:transition-colors w-full text-left"
                                        onClick={() =>
                                            setCreateDialog({
                                                open: true,
                                                parentId: null,
                                                statusId: status.id,
                                            })
                                        }
                                    >
                                        <Plus className="h-3 w-3" />
                                        Add Task
                                    </button>
                                </>
                            )}
                        </section>
                    );
                })}

                {/* Tasks with no status — same descendant-aware filtering as the status sections */}
                {(() => {
                    const visibleUnstatedTasks = activeStatusId
                        ? unstatedTasks.filter(rootMatchesActiveStatus)
                        : unstatedTasks;

                    return (
                        visibleUnstatedTasks.length > 0 && (
                            <section className="space-y-0.5">
                                <div className="flex items-center gap-2 py-2">
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        No Status
                                    </span>
                                    <span className="text-xs text-muted-foreground/60">
                                        ({visibleUnstatedTasks.length})
                                    </span>
                                </div>
                                <div className="border-b border-border/50 mb-2" />
                                <SortableContext
                                    items={visibleUnstatedTasks.map((task) => task.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {visibleUnstatedTasks.map((task) => (
                                        <div
                                            key={task.id}
                                            onClick={() => setFocusedTaskId(task.id)}
                                        >
                                            <TaskRow
                                                task={task}
                                                depth={0}
                                                flatList={flatList}
                                                listId={listId}
                                            />
                                        </div>
                                    ))}
                                </SortableContext>
                            </section>
                        )
                    );
                })()}
            </div>

            {/* Create task dialog */}
            <TaskFormDialog
                open={createDialog.open}
                onClose={() => setCreateDialog({ open: false, parentId: null })}
                parentId={createDialog.parentId ?? null}
                defaultStatusId={createDialog.statusId ?? null}
                listId={listId}
            />
        </DndContext>
    );
}
