'use client';

import { Plus } from 'lucide-react';
import { getMoveTargets } from '@/lib/tasks/move-neighbours';
import { describeBucketBreakdown } from '@/lib/tasks/task-buckets';
import StatusGroup from './StatusGroup';
import SublistHeader from './SublistHeader';

/**
 * Renders one bucket of root tasks: the main list, or one sublist with its header, grouped by status.
 *
 * A sublist with no tasks still shows its header (and an Add Task link), so it can be edited or deleted.
 *
 * @param {object} props
 * @param {object} props.bucket - Bucket from `buildTaskBuckets`
 * @param {object[]} props.statuses - The space's statuses, in display order
 * @param {object[]} props.sublists - All sublists of the list, for the Move up / Move down neighbours
 * @param {Object<string, boolean>} props.collapsedGroups - Collapsed flag per group key
 * @param {string} props.listId - The list this bucket belongs to
 * @param {boolean} props.canWrite - Whether the caller may create tasks
 * @param {string|null} props.currentUserId - Caller's user id, for row-level ownership checks
 * @param {'owner'|'full'|'restricted'|'read_only'|null} props.myPermission - Caller's tier for this space
 * @param {number|null} props.maxSubtasksPerParent - Space's direct-subtask cap, or null for no limit
 * @param {(groupKey: string) => void} props.onToggleGroup - Collapses or expands a group
 * @param {(taskId: string) => void} props.onFocusTask - Remembers the clicked row for the duplicate shortcut
 * @param {(taskId: string, neighbourId: string) => void} props.onMoveTask - Moves a task next to a neighbour
 * @param {(sublistId: string, neighbourId: string) => void} props.onMoveSublist - Moves a sublist next to a neighbour
 * @param {(sublist: object) => void} props.onEditSublist - Opens the sublist edit dialog
 * @param {(sublist: object) => void} props.onDeleteSublist - Opens the sublist delete confirmation
 * @param {(preset: { sublistId: string|null, statusId?: string }) => void} props.onAddTask - Opens task creation
 */
export default function TaskBucket({
    bucket,
    statuses,
    sublists,
    collapsedGroups,
    listId,
    canWrite,
    currentUserId,
    myPermission,
    maxSubtasksPerParent,
    onToggleGroup,
    onFocusTask,
    onMoveTask,
    onMoveSublist,
    onEditSublist,
    onDeleteSublist,
    onAddTask,
}) {
    const { sublist } = bucket;
    const sublistFlagKey = sublist ? `sublist:${sublist.id}` : null;
    const isSublistCollapsed = sublist ? collapsedGroups[sublistFlagKey] : false;
    const sublistId = sublist?.id ?? null;

    function renderSublistHeader(headerProps) {
        return (
            <SublistHeader
                sublist={sublist}
                moveTargets={getMoveTargets(sublists, sublist.id)}
                onMoveSublist={onMoveSublist}
                isCollapsed={isSublistCollapsed}
                onToggle={() => onToggleGroup(sublistFlagKey)}
                onEdit={() => onEditSublist(sublist)}
                onDelete={() => onDeleteSublist(sublist)}
                onAddTask={() => onAddTask({ sublistId })}
                {...headerProps}
            />
        );
    }

    if (bucket.tasks.length === 0) {
        if (!sublist) return null;
        return (
            <div>
                {renderSublistHeader({ taskCount: 0 })}
                {!isSublistCollapsed && canWrite && (
                    <button
                        className="flex items-center gap-1.5 ml-4 md:ml-8 mr-2 my-0.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted motion-safe:transition-colors"
                        onClick={() => onAddTask({ sublistId })}
                    >
                        <Plus className="h-3 w-3" />
                        Add Task
                    </button>
                )}
            </div>
        );
    }

    const groupProps = {
        isInSublist: Boolean(sublist),
        listId,
        onFocusTask,
        canWrite,
        currentUserId,
        myPermission,
        maxSubtasksPerParent,
        onMoveTask,
    };

    return (
        <div className="space-y-0.5">
            {sublist &&
                renderSublistHeader({
                    taskCount: bucket.allDepthCount,
                    breakdownText: describeBucketBreakdown(
                        bucket.allDepthCountsByStatusId,
                        statuses,
                    ),
                })}
            {!isSublistCollapsed && (
                <>
                    {statuses.map((status) => (
                        <StatusGroup
                            key={status.id}
                            {...groupProps}
                            status={status}
                            tasks={bucket.tasksByStatusId.get(status.id) ?? []}
                            count={bucket.allDepthCountsByStatusId.get(status.id) ?? 0}
                            isCollapsed={collapsedGroups[`${bucket.key}:${status.id}`]}
                            onToggle={() => onToggleGroup(`${bucket.key}:${status.id}`)}
                            onAddTask={() => onAddTask({ sublistId, statusId: status.id })}
                        />
                    ))}
                    <StatusGroup
                        {...groupProps}
                        status={null}
                        tasks={bucket.tasksByStatusId.get('none') ?? []}
                        count={bucket.allDepthCountsByStatusId.get('none') ?? 0}
                        isCollapsed={collapsedGroups[`${bucket.key}:none`]}
                        onToggle={() => onToggleGroup(`${bucket.key}:none`)}
                        onAddTask={() => onAddTask({ sublistId })}
                    />
                </>
            )}
        </div>
    );
}
