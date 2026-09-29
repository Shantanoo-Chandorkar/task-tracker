const SECOND_MS = 1000;
const HOUR_MS = 60 * 60 * SECOND_MS;

// Wait after failed attempt N before attempt N+1: 8 attempts over about 21 hours, then the delivery is dead-lettered
const RETRY_DELAYS_SECONDS = [30, 120, 600, 1800, 7200, 21600, 43200];
export const MAX_DELIVERY_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;

const JITTER_SPREAD = 0.4;
const MAX_RETRY_AFTER_MS = 6 * HOUR_MS;

// Consecutive failed attempts AND a long enough outage: a busy space retrying briefly must not trip the breaker
export const CIRCUIT_BREAKER_FAILURES = 50;
export const CIRCUIT_BREAKER_MIN_OUTAGE_MS = 6 * HOUR_MS;

/** Transport failures the sender classifies; only a blocked address is permanent. */
export const TRANSPORT_ERROR_CLASSES = {
    TIMEOUT: 'timeout',
    CONNECTION: 'connection',
    DNS: 'dns',
    TLS: 'tls',
    BLOCKED_ADDRESS: 'blocked_address',
    RESPONSE_TOO_LARGE: 'response_too_large',
    UNKNOWN: 'unknown',
};

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429]);
const PERMANENT_TRANSPORT_ERRORS = new Set([TRANSPORT_ERROR_CLASSES.BLOCKED_ADDRESS]);

/**
 * Decides what one finished attempt means. Pure. 410 disables the endpoint; 3xx fails as redirects are not followed.
 *
 * @param {{ statusCode: number|null, transportErrorClass: string|null }} attemptResult - HTTP status, or the
 *   transport error class when no response arrived.
 * @returns {{ verdict: 'delivered'|'retry'|'fail', shouldDisableEndpoint: boolean }} What to do next.
 */
export function classifyAttempt({ statusCode, transportErrorClass }) {
    if (statusCode === null || statusCode === undefined) {
        const isPermanent = PERMANENT_TRANSPORT_ERRORS.has(transportErrorClass);
        return { verdict: isPermanent ? 'fail' : 'retry', shouldDisableEndpoint: false };
    }
    if (statusCode >= 200 && statusCode < 300)
        return { verdict: 'delivered', shouldDisableEndpoint: false };
    if (statusCode === 410) return { verdict: 'fail', shouldDisableEndpoint: true };
    if (RETRYABLE_STATUS_CODES.has(statusCode) || statusCode >= 500)
        return { verdict: 'retry', shouldDisableEndpoint: false };
    return { verdict: 'fail', shouldDisableEndpoint: false };
}

/**
 * Computes the wait before the next attempt: table delay with +-20% jitter, or a longer Retry-After (max 6 hours).
 *
 * @param {number} attemptsMade - Attempts already made, including the one that just failed (1 or more).
 * @param {number} randomValue - A value in [0, 1), injected so tests are deterministic.
 * @param {number|null} [retryAfterSeconds] - Parsed Retry-After header, if the receiver sent one.
 * @returns {number} Milliseconds to wait.
 */
export function computeRetryDelayMs(attemptsMade, randomValue, retryAfterSeconds = null) {
    const tableIndex = Math.min(attemptsMade, RETRY_DELAYS_SECONDS.length) - 1;
    const baseDelayMs = RETRY_DELAYS_SECONDS[tableIndex] * SECOND_MS;
    const jitteredDelayMs = baseDelayMs * (1 - JITTER_SPREAD / 2 + JITTER_SPREAD * randomValue);
    const requestedDelayMs = Number.isFinite(retryAfterSeconds)
        ? Math.min(Math.max(retryAfterSeconds, 0) * SECOND_MS, MAX_RETRY_AFTER_MS)
        : 0;
    return Math.round(Math.max(jitteredDelayMs, requestedDelayMs));
}

/**
 * Turns a finished attempt into the delivery row's next state.
 *
 * @param {{ statusCode: number|null, transportErrorClass: string|null, attemptsMade: number, nowMs: number,
 *   randomValue: number, retryAfterSeconds?: number|null }} attempt - The outcome and where the delivery stands.
 * @returns {{ status: 'delivered'|'retrying'|'failed', nextAttemptAt: string|null, shouldDisableEndpoint: boolean,
 *   countsAsEndpointFailure: boolean }} New delivery status and what the endpoint counters should do.
 */
export function decideDeliveryOutcome({
    statusCode,
    transportErrorClass,
    attemptsMade,
    nowMs,
    randomValue,
    retryAfterSeconds = null,
}) {
    const { verdict, shouldDisableEndpoint } = classifyAttempt({ statusCode, transportErrorClass });

    if (verdict === 'delivered')
        return {
            status: 'delivered',
            nextAttemptAt: null,
            shouldDisableEndpoint: false,
            countsAsEndpointFailure: false,
        };

    const isOutOfAttempts = attemptsMade >= MAX_DELIVERY_ATTEMPTS;
    if (verdict === 'fail' || isOutOfAttempts)
        return {
            status: 'failed',
            nextAttemptAt: null,
            shouldDisableEndpoint,
            countsAsEndpointFailure: true,
        };

    const delayMs = computeRetryDelayMs(attemptsMade, randomValue, retryAfterSeconds);
    return {
        status: 'retrying',
        nextAttemptAt: new Date(nowMs + delayMs).toISOString(),
        shouldDisableEndpoint: false,
        countsAsEndpointFailure: true,
    };
}

/**
 * Decides whether an endpoint has been failing long enough to disable it automatically.
 *
 * @param {{ consecutiveFailures: number, healthySinceMs: number, nowMs: number }} endpointHealth - Failed attempts
 *   in a row, and when the endpoint last succeeded (or was created if it never has).
 * @returns {boolean} True when the circuit breaker should open.
 */
export function shouldTripCircuitBreaker({ consecutiveFailures, healthySinceMs, nowMs }) {
    return (
        consecutiveFailures >= CIRCUIT_BREAKER_FAILURES &&
        nowMs - healthySinceMs >= CIRCUIT_BREAKER_MIN_OUTAGE_MS
    );
}
