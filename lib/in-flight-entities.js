// Shown when a second drag-and-drop arrives while the first is still being saved.
export const REORDER_BUSY_MESSAGE = 'Still saving the last change';

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

/**
 * Runs `work` only if nothing else holds the key, and always lets go of the key afterwards.
 *
 * @param {string} entityKey - Stable key such as `reorder:tasks:<listId>`.
 * @param {() => Promise<*>} work - The async work to run exclusively.
 * @param {() => void} [onBusy] - Called instead of `work` when the key is already running.
 * @returns {Promise<*>} Whatever `work` returned, or undefined when it was busy.
 * @throws {*} Whatever `work` throws, after the key has been released.
 */
export async function runExclusively(entityKey, work, onBusy) {
    const releaseInFlight = claimInFlight(entityKey);
    if (!releaseInFlight) {
        onBusy?.();
        return undefined;
    }
    try {
        return await work();
    } finally {
        releaseInFlight();
    }
}

/**
 * Claims a key for a fixed time, so the same repeat action is ignored until the time is up.
 *
 * @param {string} entityKey - Stable key such as `export:list:<id>:csv`.
 * @param {number} durationMs - How long repeats are ignored, in milliseconds.
 * @returns {boolean} True when this call got the key, false when a repeat arrived inside the time.
 */
export function claimForDuration(entityKey, durationMs) {
    const releaseInFlight = claimInFlight(entityKey);
    if (!releaseInFlight) return false;
    setTimeout(releaseInFlight, durationMs);
    return true;
}
