'use client';

import { Fragment, useId, useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { createStableIdsReader, isStartOfUnprioritisedTier } from '@/lib/tasks/task-tree';
import TaskRow, { PriorityTierDivider } from './TaskRow';

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
 * @param {string} props.listId
 * @param {Function} props.onAddTask - Called to open task creation for this status
 * @param {Function} props.onFocusTask - Called with a task's id when its row is clicked
 * @param {boolean} props.canWrite - Whether the caller may create tasks (false for read-only collaborators)
 * @param {string|null} props.currentUserId - Caller's user id, for row-level ownership checks
 * @param {'owner'|'full'|'restricted'|'read_only'|null} props.myPermission - Caller's tier for this space
 * @param {number|null} [props.maxSubtasksPerParent] - Space's direct-subtask cap, or null for no limit
 * @param {(taskId: string, neighbourId: string) => void} [props.onMoveTask] - Moves a task next to a neighbour
 * @param {boolean} [props.isInSublist] - True when a sublist heading sits above, so this heading is one level lower
 */
export default function StatusGroup({
    status,
    tasks,
    count,
    isCollapsed,
    onToggle,
    listId,
    onAddTask,
    onFocusTask,
    canWrite,
    currentUserId,
    myPermission,
    maxSubtasksPerParent,
    onMoveTask,
    isInSublist = false,
}) {
    const headingId = useId();
    // Same array while the ids are unchanged, or SortableContext re-renders every row on each list render
    const [readStableIds] = useState(createStableIdsReader);
    const taskIds = readStableIds(tasks);
    if (tasks.length === 0) return null;
    const Heading = isInSublist ? 'h3' : 'h2';

    return (
        <section
            aria-labelledby={headingId}
            className="space-y-0.5 pl-4 md:pl-8 [--row-indent:8px] md:[--row-indent:24px]"
        >
            <Heading id={headingId}>
                <button
                    className="flex items-center gap-2 w-full py-2 text-left group/header"
                    onClick={onToggle}
                    aria-expanded={!isCollapsed}
                >
                    {isCollapsed ? (
                        <ChevronRight
                            aria-hidden="true"
                            className="h-3.5 w-3.5 text-muted-foreground"
                        />
                    ) : (
                        <ChevronDown
                            aria-hidden="true"
                            className="h-3.5 w-3.5 text-muted-foreground"
                        />
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
                    <span className="text-xs text-muted-foreground">({count ?? tasks.length})</span>
                </button>
            </Heading>

            <div className="border-b border-border/50 mb-2" />

            {!isCollapsed && (
                <>
                    <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                        {tasks.map((task, taskIndex) => (
                            <Fragment key={task.id}>
                                {isStartOfUnprioritisedTier(tasks, taskIndex) && (
                                    <PriorityTierDivider />
                                )}
                                <div onClick={() => onFocusTask(task.id)}>
                                    <TaskRow
                                        task={task}
                                        depth={0}
                                        listId={listId}
                                        currentUserId={currentUserId}
                                        myPermission={myPermission}
                                        maxSubtasksPerParent={maxSubtasksPerParent}
                                        siblingTasks={tasks}
                                        onMoveTask={onMoveTask}
                                    />
                                </div>
                            </Fragment>
                        ))}
                    </SortableContext>

                    {canWrite && (
                        <button
                            className="flex items-center gap-1.5 px-8 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted motion-safe:transition-colors w-full text-left"
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
