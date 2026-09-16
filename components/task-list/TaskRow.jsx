'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, Circle, GripVertical, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import StatusPicker from '@/components/status/StatusPicker';
import TaskRowActions from './TaskRowActions';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import DepthWarning from './DepthWarning';
import { humanReadableLabel } from '@/lib/recurrence';
import { NESTING_MODE, FINITE_MAX_DEPTH } from '@/lib/config';

/**
 * Recursive row component — renders one task and all its children.
 * Each level of children is wrapped in a SortableContext for sibling DnD reordering.
 * Indentation: `--row-indent` per depth level (16px mobile, 24px desktop), set by the ancestor section.
 *
 * @param {object} props
 * @param {object} props.task - Task node with a populated `.children` array
 * @param {number} props.depth - Current depth (0 = root)
 * @param {object[]} props.flatList - Full flat task list passed through for rearrange operations
 * @param {string} props.listId - The list this task tree belongs to
 */
export default function TaskRow({ task, depth, flatList, listId }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [addSubtaskOpen, setAddSubtaskOpen] = useState(false);

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: task.id,
        data: { parentId: task.parent_id, sublistId: task.sublist_id ?? null },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const hasChildren = task.children && task.children.length > 0;
    // MAX_DEPTH_CONSTANT
    const canAddSubtask = !(NESTING_MODE === 'finite' && depth >= FINITE_MAX_DEPTH);
    const recurringLabel = task.is_recurring ? humanReadableLabel(task.recurrence_rule) : null;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className={isDragging ? 'opacity-50 relative z-10' : ''}
        >
            {/* Task row — flat, hairline-separated: no per-row card background or radius */}
            <div
                className="group flex items-center gap-1.5 py-2 px-2 border-b border-border/60 motion-safe:transition-colors duration-150 hover:bg-muted/50 cursor-default"
                style={{ paddingLeft: `calc(var(--row-indent, 24px) * ${depth})` }}
            >
                {/* Drag handle — always visible (mobile has no hover to reveal it on) */}
                <button
                    {...listeners}
                    className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-muted-foreground p-3 -m-3 flex-shrink-0 focus:outline-none"
                    aria-label="Drag to reorder"
                    tabIndex={-1}
                >
                    <GripVertical className="h-3.5 w-3.5" />
                </button>

                {/* Expand/collapse toggle */}
                <button
                    onClick={() => setIsExpanded((prev) => !prev)}
                    className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground motion-safe:transition-colors"
                    aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                >
                    {hasChildren ? (
                        isExpanded ? (
                            <ChevronDown className="h-3 w-3 motion-safe:transition-transform duration-200" />
                        ) : (
                            <ChevronRight className="h-3 w-3 motion-safe:transition-transform duration-200" />
                        )
                    ) : (
                        <Circle className="h-1.5 w-1.5 text-muted-foreground/40" />
                    )}
                </button>

                {/* Title opens the task page; clicking elsewhere just focuses the row for keyboard shortcuts */}
                <span className="flex-1 text-sm text-foreground truncate min-w-0 flex items-center gap-1.5">
                    <Link
                        href={`/lists/${listId}/tasks/${task.id}`}
                        className="truncate no-underline text-inherit"
                    >
                        {task.title}
                    </Link>
                    {task.is_recurring && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/25 flex-shrink-0">
                                        <RefreshCw className="h-2.5 w-2.5" />
                                        Recurring
                                    </span>
                                </TooltipTrigger>
                                {recurringLabel && (
                                    <TooltipContent>
                                        <p className="capitalize">{recurringLabel}</p>
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </span>

                {/* Inline status picker */}
                <div className="flex-shrink-0">
                    <StatusPicker task={task} flatList={flatList} />
                </div>

                {/* Hover action bar */}
                <TaskRowActions
                    task={task}
                    flatList={flatList}
                    onAddSubtask={() => {
                        setIsExpanded(true);
                        setAddSubtaskOpen(true);
                    }}
                    canAddSubtask={canAddSubtask}
                    listId={listId}
                />
            </div>

            {/* A subtask is just a task, so it reuses the same create dialog as "New Task". */}
            <TaskFormDialog
                open={addSubtaskOpen}
                onClose={() => setAddSubtaskOpen(false)}
                parentId={task.id}
                listId={listId}
            />

            {/* Children container with connecting line */}
            {hasChildren && isExpanded && (
                <div
                    className="border-l border-border motion-safe:transition-all duration-200"
                    style={{ marginLeft: `calc(var(--row-indent, 24px) * ${depth} + 20px)` }}
                >
                    {/* Depth warning shown before children one level past the max. MAX_DEPTH_CONSTANT */}
                    {depth === FINITE_MAX_DEPTH + 1 && <DepthWarning />}

                    <SortableContext
                        items={task.children.map((child) => child.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {task.children.map((child) => (
                            <TaskRow
                                key={child.id}
                                task={child}
                                depth={depth + 1}
                                flatList={flatList}
                                listId={listId}
                            />
                        ))}
                    </SortableContext>
                </div>
            )}
        </div>
    );
}
