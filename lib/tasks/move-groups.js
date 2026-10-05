import { buildMoveTargetTree, hasSelectableMoveTarget } from '@/lib/tasks/move-target-tree';
import { findAncestors } from '@/lib/tasks/task-relations';
import { NESTING_MODE, FINITE_MAX_DEPTH } from '@/lib/nesting-depth';

/**
 * Works out where a task can be moved, grouped by sublist, for the "Move to..." sheet.
 *
 * @param {object} params
 * @param {object} params.task - The task that would move.
 * @param {object[]} params.flatList - Every task in the list, flat.
 * @param {object[]} params.sublists - The list's sublists.
 * @returns {{ id: string|null, name: string, color: string, roots: object[], canMoveToRoot: boolean }[]}
 *   Groups with something to pick, the task's current sublist first; `id` is null for the Main List.
 */
export function buildMoveGroups({ task, flatList, sublists }) {
    const isRootTask = !task.parent_id;

    // Only roots carry sublist_id, so the moving task's sublist is its top ancestor's.
    const movingTaskRoot = findAncestors(task.id, flatList).at(-1) ?? task;
    const currentSublistId = movingTaskRoot.sublist_id ?? null;

    const maxAllowedDepth = NESTING_MODE === 'finite' ? FINITE_MAX_DEPTH : Infinity;
    const moveTargetRoots = buildMoveTargetTree(flatList, task, maxAllowedDepth);
    const knownSublistIds = new Set(sublists.map((sublist) => sublist.id));
    // A root pointing at a sublist that no longer exists falls back to the Main List group.
    const getGroupIdForRoot = (root) =>
        knownSublistIds.has(root.sublist_id) ? root.sublist_id : null;

    const targetGroups = [
        { id: null, name: 'Main List', color: 'var(--primary)' },
        ...sublists.map((sublist) => ({
            id: sublist.id,
            name: sublist.name,
            color: sublist.color,
        })),
    ].map((group) => ({
        ...group,
        roots: moveTargetRoots.filter((root) => getGroupIdForRoot(root) === group.id),
    }));

    return [
        targetGroups.find((targetGroup) => targetGroup.id === currentSublistId),
        ...targetGroups.filter((targetGroup) => targetGroup.id !== currentSublistId),
    ]
        .filter(Boolean)
        .map((group) => ({
            ...group,
            canMoveToRoot: isRootTask && group.id !== task.sublist_id,
        }))
        .filter((group) => group.canMoveToRoot || hasSelectableMoveTarget(group.roots));
}
