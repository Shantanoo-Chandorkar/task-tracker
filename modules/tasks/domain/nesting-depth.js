// One constant for server and client; replace it with a per-user setting only when such a setting exists.
export const NESTING_MODE = 'finite'; // 'finite' | 'infinite'

// MAX_DEPTH_CONSTANT - deepest allowed task depth (0-indexed) in finite mode: 0, 1, 2 = 3 levels.
export const FINITE_MAX_DEPTH = 2;

/**
 * Whether a task at the given depth is allowed under the given nesting mode.
 *
 * @param {number} depth - Task depth to check (0 = root)
 * @param {'finite'|'infinite'} [nestingMode] - Defaults to the app-wide mode
 * @returns {boolean}
 */
export function isDepthAllowed(depth, nestingMode = NESTING_MODE) {
    return nestingMode !== 'finite' || depth <= FINITE_MAX_DEPTH;
}
