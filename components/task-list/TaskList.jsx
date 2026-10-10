'use client';

import { useState, useEffect, useMemo } from 'react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { buildTaskBuckets, countTasksByStatusId } from '@/lib/tasks/task-buckets';
import { createStableTreeBuilder } from '@/lib/tasks/task-tree';
import { getStatusGroupFlagKey } from '@/lib/tasks/status-group-collapse';
import { toggleFlag as toggleGroup, useUIFlags } from '@/providers/UIStateProvider';
import { useStatusesQuery } from '@/hooks/useStatusesQuery';
import { useTasksQuery } from '@/hooks/useTasksQuery';
import { useSpaceIdForList } from '@/hooks/useSpaceIdForList';
import { useSublistsQuery } from '@/hooks/useSublistsQuery';
import { usePermissionForSpace } from '@/hooks/usePermissionForSpace';
import { useSpaceById } from '@/hooks/useSpaceById';
import { useTaskFilters } from '@/hooks/useTaskFilters';
import { useListDragAndDrop } from '@/hooks/useListDragAndDrop';
import { useDuplicateShortcut } from '@/hooks/useDuplicateShortcut';
import { useSublistDeletion } from '@/hooks/useSublistDeletion';
import TaskFormDialog, { scheduleEditorPrefetch } from '@/components/task-form/TaskFormDialog';
import SublistFormDialog from '@/components/space/SublistFormDialog';
import TaskFilterSheet from './TaskFilterSheet';
import TaskFilterBar from './TaskFilterBar';
import VelocityMeter from './VelocityMeter';
import ListHeader from './ListHeader';
import TaskBucket from './TaskBucket';
import EmptyListState from './EmptyListState';
import DeleteSublistDialog from './DeleteSublistDialog';

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
    const [createDialog, setCreateDialog] = useState({
        open: false,
        parentId: null,
        sublistId: null,
    });
    useEffect(() => scheduleEditorPrefetch(), []);

    const [filterSheetOpen, setFilterSheetOpen] = useState(false);
    const [sublistDialog, setSublistDialog] = useState({ open: false, sublist: null });

    const { data: flatList = [] } = useTasksQuery(listId, { initialData: initialTasks });

    const spaceId = useSpaceIdForList(listId, { initialData: initialLists });
    const { data: statuses = [] } = useStatusesQuery(spaceId, { initialData: initialStatuses });

    const { data: sublists = [] } = useSublistsQuery(listId, { initialData: initialSublists });

    // A UX hint only - RLS and the app-layer pre-checks are the real backstop if a control is missed.
    const myPermission = usePermissionForSpace(spaceId, { initialData: initialSpaces });
    const canWrite = myPermission !== 'read_only';
    const maxSubtasksPerParent =
        useSpaceById(spaceId, { initialData: initialSpaces })?.max_subtasks_per_parent ?? null;

    // Reuses nodes whose task did not change, so memoized rows are skipped when another task is edited
    const [buildStableTree] = useState(createStableTreeBuilder);
    const rootTasks = useMemo(() => buildStableTree(flatList), [buildStableTree, flatList]);

    const countsByStatusId = useMemo(
        () => countTasksByStatusId(statuses, flatList),
        [statuses, flatList],
    );

    const { filters, activeCount } = useTaskFilters();

    const doneStatus = statuses.find((status) => status.code === 'done');
    const completedCount = doneStatus ? (countsByStatusId[doneStatus.id] ?? 0) : 0;

    const buckets = useMemo(
        () =>
            buildTaskBuckets({
                rootTasks,
                flatList,
                sublists,
                filters,
                hasActiveFilters: activeCount > 0,
                doneStatusId: doneStatus?.id ?? null,
            }),
        [rootTasks, sublists, flatList, doneStatus, activeCount, filters],
    );

    // Only the group headers' flags, so expanding one task row does not re-render the whole list
    const groupFlagKeys = useMemo(
        () =>
            buckets.flatMap((bucket) => [
                ...(bucket.sublist ? [`sublist:${bucket.sublist.id}`] : []),
                ...statuses.map((status) => getStatusGroupFlagKey(bucket.key, status)),
                getStatusGroupFlagKey(bucket.key, null),
            ]),
        [buckets, statuses],
    );
    const groupFlags = useUIFlags(groupFlagKeys);

    const { dndContextProps, onMoveTask, onMoveSublist } = useListDragAndDrop(
        listId,
        flatList,
        sublists,
    );
    const onFocusTask = useDuplicateShortcut(listId);
    const sublistDeletion = useSublistDeletion(listId, flatList);

    if (flatList.length === 0 && sublists.length === 0) {
        return (
            <EmptyListState
                listId={listId}
                initialSpaces={initialSpaces}
                initialLists={initialLists}
                canWrite={canWrite}
            />
        );
    }

    return (
        <DndContext {...dndContextProps}>
            <div className="space-y-6">
                <ListHeader
                    listId={listId}
                    initialSpaces={initialSpaces}
                    initialLists={initialLists}
                >
                    {doneStatus && (
                        <VelocityMeter
                            completedCount={completedCount}
                            totalCount={flatList.length}
                        />
                    )}
                </ListHeader>

                <TaskFilterBar
                    spaceId={spaceId}
                    statuses={statuses}
                    onOpenSheet={() => setFilterSheetOpen(true)}
                />

                <TaskFilterSheet
                    open={filterSheetOpen}
                    onClose={() => setFilterSheetOpen(false)}
                    spaceId={spaceId}
                    statuses={statuses}
                    countsByStatusId={countsByStatusId}
                />

                <SortableContext
                    items={sublists.map((sublist) => sublist.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {buckets.map((bucket) => (
                        <TaskBucket
                            key={bucket.key}
                            bucket={bucket}
                            statuses={statuses}
                            sublists={sublists}
                            groupFlags={groupFlags}
                            listId={listId}
                            canWrite={canWrite}
                            currentUserId={currentUserId}
                            myPermission={myPermission}
                            maxSubtasksPerParent={maxSubtasksPerParent}
                            onToggleGroup={toggleGroup}
                            onFocusTask={onFocusTask}
                            onMoveTask={onMoveTask}
                            onMoveSublist={onMoveSublist}
                            onEditSublist={(sublist) => setSublistDialog({ open: true, sublist })}
                            onDeleteSublist={sublistDeletion.requestDelete}
                            onAddTask={({ sublistId, statusId }) =>
                                setCreateDialog({ open: true, parentId: null, sublistId, statusId })
                            }
                        />
                    ))}
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

            <DeleteSublistDialog deletion={sublistDeletion} />
        </DndContext>
    );
}
