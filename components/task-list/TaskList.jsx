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
} from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { flatToTree } from '@/lib/tree';
import { useClipboard } from '@/hooks/useClipboard';
import TaskRow from './TaskRow';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import StatusBadge from '@/components/status/StatusBadge';
import { Button } from '@/components/ui/button';

/**
 * Root task list container.
 * Groups root-level tasks by status with collapsible section headers.
 * Provides DnD context for sibling reordering within each status group.
 * Registers global keyboard shortcuts for clipboard operations (Ctrl+C/X/V).
 *
 * @param {object} props
 * @param {object[]} props.initialTasks - SSR-fetched flat task list (hydrates TanStack Query)
 * @param {object[]} props.initialStatuses - SSR-fetched statuses (hydrates TanStack Query)
 */
export default function TaskList({ initialTasks, initialStatuses }) {
    const queryClient = useQueryClient();
    const { clipboard, copyTask, cutTask, pasteTask } = useClipboard();

    const [focusedTaskId, setFocusedTaskId] = useState(null);
    const [createDialog, setCreateDialog] = useState({ open: false, parentId: null });
    const [collapsedGroups, setCollapsedGroups] = useState({});

    const { data: flatList = [] } = useQuery({
        queryKey: ['tasks'],
        queryFn: async () => {
            const res = await fetch('/api/tasks');
            if (!res.ok) throw new Error('Failed to fetch tasks');
            return res.json();
        },
        initialData: initialTasks,
    });

    const { data: statuses = [] } = useQuery({
        queryKey: ['statuses'],
        queryFn: async () => {
            const res = await fetch('/api/statuses');
            if (!res.ok) throw new Error('Failed to fetch statuses');
            return res.json();
        },
        initialData: initialStatuses,
    });

    // Build nested tree and group root tasks by status
    const tree = flatToTree(flatList);
    const rootTasks = tree; // flatToTree already returns only root nodes

    // Group root tasks by status_id
    const tasksByStatus = {};
    for (const status of statuses) {
        tasksByStatus[status.id] = rootTasks.filter((t) => t.status_id === status.id);
    }
    const unstatedTasks = rootTasks.filter((t) => !t.status_id);

    // DnD sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    async function handleDragEnd({ active, over }) {
        if (!over || active.id === over.id) return;

        const activeTask = flatList.find((t) => t.id === active.id);
        if (!activeTask) return;

        try {
            await fetch(`/api/tasks/${active.id}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    newParentId: activeTask.parent_id ?? null,
                    afterId: over.id,
                }),
            });
            await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        } catch (err) {
            console.error('Drag reorder failed:', err);
        }
    }

    // Global keyboard shortcuts for clipboard operations
    // Uses the currently focused task as the source/target
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
                pasteTask(focusedTaskId ?? null, queryClient);
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedTaskId, flatList, clipboard, copyTask, cutTask, pasteTask, queryClient]);

    function toggleGroup(statusId) {
        setCollapsedGroups((prev) => ({ ...prev, [statusId]: !prev[statusId] }));
    }

    // Empty state when no tasks exist at all
    if (flatList.length === 0) {
        return (
            <>
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
                />
            </>
        );
    }

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="space-y-6">
                {/* Only render status groups that have at least one root task */}
                {statuses
                    .filter((s) => (tasksByStatus[s.id] ?? []).length > 0)
                    .map((status) => {
                        const tasks = tasksByStatus[status.id] ?? [];
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
                                            items={tasks.map((t) => t.id)}
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

                {/* Tasks with no status */}
                {unstatedTasks.length > 0 && (
                    <section className="space-y-0.5">
                        <div className="flex items-center gap-2 py-2">
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                No Status
                            </span>
                            <span className="text-xs text-muted-foreground/60">
                                ({unstatedTasks.length})
                            </span>
                        </div>
                        <div className="border-b border-border/50 mb-2" />
                        <SortableContext
                            items={unstatedTasks.map((t) => t.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {unstatedTasks.map((task) => (
                                <div key={task.id} onClick={() => setFocusedTaskId(task.id)}>
                                    <TaskRow task={task} depth={0} flatList={flatList} />
                                </div>
                            ))}
                        </SortableContext>
                    </section>
                )}

                {/* Global add task button */}
                <div className="pt-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreateDialog({ open: true, parentId: null })}
                        className="gap-1.5"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        New Task
                    </Button>
                </div>
            </div>

            {/* Create task dialog */}
            <TaskFormDialog
                open={createDialog.open}
                onClose={() => setCreateDialog({ open: false, parentId: null })}
                parentId={createDialog.parentId ?? null}
            />
        </DndContext>
    );
}
