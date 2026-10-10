import { closestCenter } from '@dnd-kit/core';

/**
 * Collision detection scoped to the dragged row's own siblings (parent_id + sublist_id) and priority tier.
 * Sublist headers fall back to plain closestCenter - they're already one flat list.
 *
 * @param {object} args - dnd-kit collision detection arguments
 * @returns {object[]} Collisions, scoped to siblings when possible
 */
export function siblingScopedCollisionDetection(args) {
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
