// Call getNestingMode() everywhere, not this constant — it's the one seam a future per-user setting replaces.
export const NESTING_MODE = 'finite'; // 'finite' | 'infinite'

// Deepest allowed task depth (0-indexed) in finite mode: 0, 1, 2 = 3 levels.
export const FINITE_MAX_DEPTH = 2;

/**
 * Resolves the active nesting mode — plain constant for now, safe on server or client.
 *
 * @returns {Promise<'finite'|'infinite'>}
 */
export async function getNestingMode() {
    return NESTING_MODE;
}

/**
 * Whether a task at the given depth is allowed under the given nesting mode.
 *
 * @param {number} depth - Task depth to check (0 = root)
 * @param {'finite'|'infinite'} nestingMode
 * @returns {boolean}
 */
export function isDepthAllowed(depth, nestingMode) {
    return nestingMode !== 'finite' || depth <= FINITE_MAX_DEPTH;
}
