// A running session older than this (since its last resume) is flagged stale - decision 13.
const STALE_RUNNING_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Computes a session's elapsed seconds at a given instant - never stored directly (decision 11).
 *
 * @param {Record<string, any>} session - The session row; needs status, accumulated_seconds, last_resumed_at.
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
 * @param {Record<string, any>} session - The session row; needs status, last_resumed_at.
 * @param {Date} now - The instant to check staleness at.
 * @returns {boolean} True when the session has been running past the stale threshold.
 */
export function isSessionStale(session, now) {
    if (session.status !== 'running' || !session.last_resumed_at) return false;
    const runningMs = now.getTime() - new Date(session.last_resumed_at).getTime();
    return runningMs > STALE_RUNNING_THRESHOLD_MS;
}

/**
 * Formats a second count as `mm:ss`, or `h:mm:ss` once it reaches an hour.
 *
 * @param {number} totalSeconds - Elapsed seconds, as from `computeElapsedSeconds`.
 * @returns {string} The formatted duration.
 */
export function formatElapsedDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    /** @param {number} unit */
    const pad = (unit) => String(unit).padStart(2, '0');

    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
