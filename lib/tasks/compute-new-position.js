import { getPositionBetween } from '@/lib/tasks/fractional-index';

/**
 * Computes the new position for a task inserted among the given siblings, using fractional indexing.
 *
 * @param {{ id: string, position: number }[]} siblings - Sorted sibling list (excluding the moving task)
 * @param {string|null} afterSiblingId - ID of the sibling to insert after, or null to append at the end
 * @param {boolean} [shouldPrependToStart] - If true, insert as the new first sibling instead (overrides afterSiblingId)
 * @returns {number} New position value
 */
export function computeNewPosition(siblings, afterSiblingId, shouldPrependToStart) {
    if (shouldPrependToStart) {
        const firstSibling = siblings[0];
        return getPositionBetween(null, firstSibling?.position ?? null);
    }

    if (!afterSiblingId) {
        const lastSibling = siblings[siblings.length - 1];
        return getPositionBetween(lastSibling?.position ?? null, null);
    }

    const afterSiblingIndex = siblings.findIndex((sibling) => sibling.id === afterSiblingId);
    if (afterSiblingIndex === -1) {
        const lastSibling = siblings[siblings.length - 1];
        return getPositionBetween(lastSibling?.position ?? null, null);
    }

    const beforePosition = siblings[afterSiblingIndex].position;
    const afterPosition = siblings[afterSiblingIndex + 1]?.position ?? null;
    return getPositionBetween(beforePosition, afterPosition);
}
