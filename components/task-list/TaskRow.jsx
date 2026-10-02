'use client';

import { Fragment, memo, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, ChevronDown, ChevronRight, Circle, GripVertical, Star } from 'lucide-react';
import StatusPicker from '@/components/status/StatusPicker';
import TaskRowTags from './TaskRowTags';
import TaskRowRecurrence from './TaskRowRecurrence';
import TaskRowActions from './TaskRowActions';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import CompleteTaskDialog from './CompleteTaskDialog';
import MountOnFirstOpen from '@/components/ui/MountOnFirstOpen';
import LimitWarning from './LimitWarning';
import { NESTING_MODE, FINITE_MAX_DEPTH } from '@/lib/config';
import { useUIFlag, toggleFlag, setFlag } from '@/providers/UIStateProvider';
import { useTaskCompletion } from '@/hooks/useTaskCompletion';
import { useTaskPriority } from '@/hooks/useTaskPriority';
import { useGetTasks } from '@/hooks/useTasksQuery';
import { isStartOfUnprioritisedTier } from '@/lib/tree';
import { getMoveTargets } from '@/lib/move-targets';

/**
 * Plain line between the prioritised and unprioritised tier, named so it is not an anonymous separator.
 *
 * @returns {JSX.Element}
 */
export function PriorityTierDivider() {
    return (
        <div
            role="separator"
            aria-label="Prioritised tasks above, other tasks below"
            className="my-1.5 h-px bg-foreground/20"
        />
    );
}

/**
 * Short amber bar beside the title of a prioritised row below `lg`, where the star button is hidden.
 * Sits in the gap before the title column, so it shifts nothing; desktop keeps the star.
 *
 * @returns {JSX.Element}
 */
export function PriorityLine() {
    return (
        <div className="pointer-events-none absolute -left-1.5 top-1 h-4 w-[3px] rounded-full bg-amber-600 dark:bg-amber-400 lg:hidden">
            <span className="sr-only">Prioritised</span>
        </div>
    );
}

/**
 * Recursive row component - renders one task and all its children.
 * Each level of children is wrapped in a SortableContext for sibling DnD reordering.
 * Indentation: `--row-indent` per depth level (16px mobile, 24px desktop), set by the ancestor section.
 *
 * @param {object} props
 * @param {object} props.task - Task node with a populated `.children` array
 * @param {number} props.depth - Current depth (0 = root)
 * @param {string} props.listId - The list this task tree belongs to
 * @param {string|null} [props.currentUserId] - Caller's user id, for row-level ownership checks
 * @param {'owner'|'full'|'restricted'|'read_only'|null} [props.myPermission] - Caller's tier for this space
 * @param {number|null} [props.maxSubtasksPerParent] - Space's direct-subtask cap, or null for no limit
 * @param {object[]} [props.siblingTasks] - Rows in this task's own sortable list, for Move up and Move down
 * @param {(taskId: string, neighbourId: string) => void} [props.onMoveTask] - Moves a task next to a neighbour
 */
function TaskRow({
    task,
    depth,
    listId,
    currentUserId,
    myPermission,
    maxSubtasksPerParent,
    siblingTasks,
    onMoveTask,
}) {
    const [addSubtaskOpen, setAddSubtaskOpen] = useState(false);
    const expandKey = `task-row:${task.id}`;
    const isExpanded = useUIFlag(expandKey);

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: task.id,
        data: {
            parentId: task.parent_id,
            sublistId: task.sublist_id ?? null,
            isPrioritised: Boolean(task.is_prioritised),
        },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // The star changes tier, so Move up and Move down never step across the prioritised line
    const moveTargets = onMoveTask
        ? getMoveTargets(
              siblingTasks,
              task.id,
              (row, neighbourRow) =>
                  Boolean(row.is_prioritised) === Boolean(neighbourRow.is_prioritised),
          )
        : null;

    // A new array each render would make SortableContext re-render every child on any change
    const childIds = useMemo(() => task.children.map((child) => child.id), [task.children]);
    const hasChildren = task.children && task.children.length > 0;
    const directChildCount = task.children?.length ?? 0;
    const isSubtaskCapReached =
        maxSubtasksPerParent != null && directChildCount >= maxSubtasksPerParent;
    const isOverSubtaskCap =
        maxSubtasksPerParent != null && directChildCount > maxSubtasksPerParent;
    // MAX_DEPTH_CONSTANT
    const canAddSubtask =
        !(NESTING_MODE === 'finite' && depth >= FINITE_MAX_DEPTH) && !isSubtaskCapReached;

    const getTasks = useGetTasks(listId);
    const completion = useTaskCompletion(listId);
    const { doneStatus, defaultStatus, isDone, setComplete, completeDialogProps } = completion;
    const taskIsDone = isDone(task);
    const { togglePriority } = useTaskPriority(listId);
    const canToggleComplete = Boolean(doneStatus && defaultStatus);

    function handleToggleComplete(clickEvent) {
        clickEvent.stopPropagation();
        setComplete(task, getTasks(), listId, !taskIsDone);
    }

    // Only clicks on data-row-space wrappers toggle expand; portalled menu clicks bubble here but lack it.
    function handleRowClick(clickEvent) {
        if (hasChildren && clickEvent.target.hasAttribute('data-row-space')) {
            toggleFlag(expandKey);
        }
    }

    // Each nested container already shifts its rows right, so one indent per level is enough (not depth times)
    const nestedRowPadding = depth > 0 ? 'var(--row-indent, 24px)' : 0;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={isDragging ? 'opacity-50 relative z-10' : ''}
        >
            {/* Task row - flat, hairline-separated: no per-row card background or radius */}
            <div
                onClick={handleRowClick}
                data-row-space
                className="group flex items-start gap-1.5 py-2 px-2 border-b border-border/60 motion-safe:transition-colors duration-150 hover:bg-muted/50 cursor-pointer"
                style={{ paddingLeft: nestedRowPadding }}
            >
                {/* h-6 matches the 3-dot button so these controls centre on the title line, not the whole two-row block */}
                <div data-row-space className="flex h-6 flex-shrink-0 items-center gap-1.5">
                    {/* Drag handle - always visible (mobile has no hover to reveal it on) */}
                    <button
                        {...listeners}
                        {...attributes}
                        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-3 -m-3 flex-shrink-0"
                        aria-label={`Drag to reorder ${task.title}`}
                    >
                        <GripVertical className="h-3.5 w-3.5" />
                    </button>

                    {/* Hidden below lg - mobile operates entirely through the 3-dot menu, which has the same action */}
                    <button
                        onClick={handleToggleComplete}
                        disabled={!canToggleComplete}
                        className={`hit-area hidden lg:flex flex-shrink-0 h-4 w-4 items-center justify-center rounded border motion-safe:transition-colors ${
                            taskIsDone
                                ? 'border-metric bg-metric text-background'
                                : 'border-field hover:border-foreground'
                        } ${!canToggleComplete ? 'opacity-40' : ''}`}
                        aria-label={taskIsDone ? 'Mark as incomplete' : 'Mark as complete'}
                    >
                        {taskIsDone && <Check className="h-3 w-3" strokeWidth={3} />}
                    </button>

                    {/* Expand/collapse toggle */}
                    <button
                        onClick={() => toggleFlag(expandKey)}
                        className="hit-area flex-shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground motion-safe:transition-colors"
                        aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                    >
                        {hasChildren ? (
                            isExpanded ? (
                                <ChevronDown
                                    aria-hidden="true"
                                    className="h-3 w-3 motion-safe:transition-transform duration-200"
                                />
                            ) : (
                                <ChevronRight
                                    aria-hidden="true"
                                    className="h-3 w-3 motion-safe:transition-transform duration-200"
                                />
                            )
                        ) : (
                            <Circle
                                aria-hidden="true"
                                className="h-1.5 w-1.5 text-muted-foreground/40"
                            />
                        )}
                    </button>

                    {/* Hidden below lg - mobile operates entirely through the 3-dot menu, which has the same action */}
                    <button
                        onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            togglePriority(task);
                        }}
                        className="hidden lg:flex flex-shrink-0 items-center justify-center p-2 -m-2"
                        aria-label={
                            task.is_prioritised ? 'Remove from priority' : 'Put on priority'
                        }
                        aria-pressed={Boolean(task.is_prioritised)}
                    >
                        <Star
                            className={`h-3.5 w-3.5 motion-safe:transition-colors ${
                                task.is_prioritised
                                    ? 'fill-amber-600 text-amber-600 dark:fill-amber-400 dark:text-amber-400'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        />
                    </button>
                </div>

                {/* Two lines: title + actions, then metadata - so pills can never squeeze the title */}
                <div data-row-space className="relative flex min-w-0 flex-1 flex-col gap-1">
                    {task.is_prioritised && <PriorityLine />}
                    <div data-row-space className="flex items-center gap-[2rem]">
                        {/* No onClick here: the row's handler already toggles, a second one would cancel it out */}
                        <span
                            data-row-space
                            className={`flex-1 min-w-0 text-sm line-clamp-2 lg:line-clamp-1 [overflow-wrap:anywhere] ${
                                taskIsDone
                                    ? 'text-muted-foreground line-through'
                                    : 'text-foreground'
                            }`}
                        >
                            <Link
                                href={`/lists/${listId}/tasks/${task.id}`}
                                className="no-underline text-inherit"
                            >
                                {task.title}
                            </Link>
                        </span>

                        {/* Hover action bar */}
                        <TaskRowActions
                            task={task}
                            completion={completion}
                            onAddSubtask={() => {
                                setFlag(expandKey, true);
                                setAddSubtaskOpen(true);
                            }}
                            canAddSubtask={canAddSubtask}
                            listId={listId}
                            currentUserId={currentUserId}
                            myPermission={myPermission}
                            moveTargets={moveTargets}
                            onMoveTask={onMoveTask}
                        />
                    </div>

                    {/* Read-only pills on the left; the status picker is a control, so it sits apart on the right */}
                    <div data-row-space className="flex items-center gap-[2rem]">
                        {/* Wraps so pills never push the status picker past the row edge */}
                        <div
                            data-row-space
                            className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
                        >
                            {task.is_recurring && (
                                <TaskRowRecurrence recurrenceRule={task.recurrence_rule} />
                            )}
                            <TaskRowTags tags={task.tags} />
                        </div>
                        <div className="ml-auto flex-shrink-0">
                            <StatusPicker task={task} completion={completion} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Not dismissible - a space's subtask cap must stay visible until it's actually resolved. */}
            {isOverSubtaskCap && (
                <div style={{ paddingLeft: nestedRowPadding }}>
                    <LimitWarning
                        message={`This task has ${directChildCount} subtasks, over this space's limit of ${maxSubtasksPerParent}. Remove some or raise the limit before adding more.`}
                    />
                </div>
            )}

            {/* A subtask is just a task, so it reuses the same create dialog as "New Task". */}
            <MountOnFirstOpen open={addSubtaskOpen}>
                <TaskFormDialog
                    open={addSubtaskOpen}
                    onClose={() => setAddSubtaskOpen(false)}
                    parentId={task.id}
                    listId={listId}
                />
            </MountOnFirstOpen>

            {/* Cascade complete/incomplete confirmation for the row checkbox */}
            <MountOnFirstOpen open={completeDialogProps.open}>
                <CompleteTaskDialog {...completeDialogProps} />
            </MountOnFirstOpen>

            {/* Children container with connecting line */}
            {hasChildren && isExpanded && (
                <div
                    className="border-l border-border motion-safe:transition-all duration-200"
                    style={{ marginLeft: '20px' }}
                >
                    {/* Depth warning shown before children one level past the max. MAX_DEPTH_CONSTANT */}
                    {depth === FINITE_MAX_DEPTH + 1 && (
                        <LimitWarning
                            message="Tasks are 4+ levels deep. Consider breaking this into separate top-level tasks for clarity."
                            dismissible
                            dismissKey="depth_warning_dismissed"
                        />
                    )}

                    <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
                        {task.children.map((child, childIndex) => (
                            <Fragment key={child.id}>
                                {isStartOfUnprioritisedTier(task.children, childIndex) && (
                                    <PriorityTierDivider />
                                )}
                                <TaskRow
                                    task={child}
                                    depth={depth + 1}
                                    listId={listId}
                                    currentUserId={currentUserId}
                                    myPermission={myPermission}
                                    maxSubtasksPerParent={maxSubtasksPerParent}
                                    siblingTasks={task.children}
                                    onMoveTask={onMoveTask}
                                />
                            </Fragment>
                        ))}
                    </SortableContext>
                </div>
            )}
        </div>
    );
}

/**
 * Tells whether two sibling lists order and tier their rows the same, which is all Move up and Move down read.
 *
 * @param {object[]} [previousSiblings]
 * @param {object[]} [nextSiblings]
 * @returns {boolean}
 */
function haveSameSiblingOrder(previousSiblings = [], nextSiblings = []) {
    return (
        previousSiblings.length === nextSiblings.length &&
        previousSiblings.every(
            (sibling, siblingIndex) =>
                sibling.id === nextSiblings[siblingIndex].id &&
                Boolean(sibling.is_prioritised) ===
                    Boolean(nextSiblings[siblingIndex].is_prioritised),
        )
    );
}

/**
 * Lets memo skip a row unless something it shows changed, comparing siblings by order only.
 *
 * @param {object} previousProps
 * @param {object} nextProps
 * @returns {boolean} True when the row can keep its last render.
 */
function hasSameRowProps(previousProps, nextProps) {
    const propNames = new Set([...Object.keys(previousProps), ...Object.keys(nextProps)]);
    for (const propName of propNames) {
        if (propName === 'siblingTasks') continue;
        if (!Object.is(previousProps[propName], nextProps[propName])) return false;
    }
    return haveSameSiblingOrder(previousProps.siblingTasks, nextProps.siblingTasks);
}

export default memo(TaskRow, hasSameRowProps);
