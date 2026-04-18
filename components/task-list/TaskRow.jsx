'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, Circle, GripVertical, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import StatusPicker from '@/components/status/StatusPicker';
import TaskRowActions from './TaskRowActions';
import TaskRowInlineAdd from './TaskRowInlineAdd';
import DepthWarning from './DepthWarning';
import { useClipboardContext } from '@/providers/ClipboardProvider';
import { humanReadableLabel } from '@/lib/recurrence';

/**
 * Recursive row component — renders one task and all its children.
 * Each level of children is wrapped in a SortableContext for sibling DnD reordering.
 * Indentation: 24px per depth level. Children have a faint left border as a connecting line.
 *
 * @param {object} props
 * @param {object} props.task - Task node with a populated `.children` array
 * @param {number} props.depth - Current depth (0 = root)
 * @param {object[]} props.flatList - Full flat task list passed through for rearrange operations
 */
export default function TaskRow({ task, depth, flatList }) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [showInlineAdd, setShowInlineAdd] = useState(false);
    const { clipboard } = useClipboardContext();

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: task.id,
        data: { parentId: task.parent_id },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const isCut = clipboard.mode === 'cut' && clipboard.taskId === task.id;
    const hasChildren = task.children && task.children.length > 0;
    const recurringLabel = task.is_recurring ? humanReadableLabel(task.recurrence_rule) : null;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className={isDragging ? 'opacity-50 relative z-10' : ''}
        >
            {/* Task row */}
            <div
                className={`group flex items-center gap-1.5 py-1.5 px-2 rounded-sm motion-safe:transition-colors duration-150 hover:bg-zinc-800/50 cursor-default ${isCut ? 'opacity-40' : ''}`}
                style={{ paddingLeft: `${depth * 24 + 8}px` }}
            >
                {/* Drag handle — visible on hover only */}
                <button
                    {...listeners}
                    className="invisible group-hover:visible cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 p-0.5 flex-shrink-0 focus:outline-none"
                    aria-label="Drag to reorder"
                    tabIndex={-1}
                >
                    <GripVertical className="h-3.5 w-3.5" />
                </button>

                {/* Expand/collapse toggle */}
                <button
                    onClick={() => setIsExpanded((prev) => !prev)}
                    className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-zinc-300 motion-safe:transition-colors"
                    aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                >
                    {hasChildren ? (
                        isExpanded ? (
                            <ChevronDown className="h-3 w-3 motion-safe:transition-transform duration-200" />
                        ) : (
                            <ChevronRight className="h-3 w-3 motion-safe:transition-transform duration-200" />
                        )
                    ) : (
                        <Circle className="h-1.5 w-1.5 text-zinc-700" />
                    )}
                </button>

                {/* Task title + recurring badge */}
                <span className="flex-1 text-sm text-zinc-200 truncate min-w-0 flex items-center gap-1.5">
                    {task.title}
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
                    <StatusPicker task={task} />
                </div>

                {/* Hover action bar */}
                <TaskRowActions
                    task={task}
                    flatList={flatList}
                    onAddSubtask={() => setShowInlineAdd(true)}
                />
            </div>

            {/* Inline subtask add input */}
            <TaskRowInlineAdd
                task={task}
                depth={depth}
                visible={showInlineAdd}
                onClose={() => setShowInlineAdd(false)}
            />

            {/* Children container with connecting line */}
            {hasChildren && isExpanded && (
                <div
                    className="border-l border-zinc-700/50 motion-safe:transition-all duration-200"
                    style={{ marginLeft: `${depth * 24 + 20}px` }}
                >
                    {/* Depth warning shown before children that would be at depth 4+ */}
                    {depth === 3 && <DepthWarning />}

                    <SortableContext
                        items={task.children.map((c) => c.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {task.children.map((child) => (
                            <TaskRow
                                key={child.id}
                                task={child}
                                depth={depth + 1}
                                flatList={flatList}
                            />
                        ))}
                    </SortableContext>
                </div>
            )}
        </div>
    );
}
