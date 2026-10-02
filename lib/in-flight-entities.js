// Module-level so every hook instance (row menu, shortcut, star) shares one guard per entity.
const inFlightKeys = new Set();

/**
 * Claims the right to run one mutation on an entity, so repeat clicks and shortcuts cannot overlap.
 *
 * @param {string} entityKey - Stable key such as `task-duplicate:<id>`.
 * @returns {(() => void)|null} Release function once the work settles, or null if one is already in flight.
 */
export function claimInFlight(entityKey) {
    if (inFlightKeys.has(entityKey)) return null;
    inFlightKeys.add(entityKey);
    return () => inFlightKeys.delete(entityKey);
}
