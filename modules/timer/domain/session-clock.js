// A running session older than this (since its last resume) is flagged stale - decision 13.
const STALE_RUNNING_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Computes a session's elapsed seconds at a given instant - never stored directly (decision 11).
 *
 * @param {{ status: string, accumulated_seconds: number, last_resumed_at: string|null }} session - The session row.
 * @param {Date} now - The instant to measure elapsed time at.
 * @returns {number} Total elapsed seconds.
 */
export function computeElapsedSeconds(session, now) {
    if (session.status !== 'running' || !session.last_resumed_at) {
        return session.accumulated_seconds;
    }
    const runningMs = now.getTime() - new Date(session.last_resumed_at).getTime();
    return session.accumulated_seconds + Math.max(0, Math.floor(runningMs / 1000));
}

/**
 * Whether a running session has been live long enough to flag as stale (decision 13).
 *
 * @param {{ status: string, last_resumed_at: string|null }} session - The session row.
 * @param {Date} now - The instant to check staleness at.
 * @returns {boolean} True when the session has been running past the stale threshold.
 */
export function isSessionStale(session, now) {
    if (session.status !== 'running' || !session.last_resumed_at) return false;
    const runningMs = now.getTime() - new Date(session.last_resumed_at).getTime();
    return runningMs > STALE_RUNNING_THRESHOLD_MS;
}
