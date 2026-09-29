// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    CIRCUIT_BREAKER_FAILURES,
    CIRCUIT_BREAKER_MIN_OUTAGE_MS,
    MAX_DELIVERY_ATTEMPTS,
    classifyAttempt,
    computeRetryDelayMs,
    decideDeliveryOutcome,
    shouldTripCircuitBreaker,
} from './delivery-retry-policy';

const NOW = Date.parse('2026-01-01T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

describe('classifyAttempt', () => {
    it.each([200, 201, 202, 204, 299])('delivers on %i', (statusCode) => {
        expect(classifyAttempt({ statusCode, transportErrorClass: null })).toEqual({
            verdict: 'delivered',
            shouldDisableEndpoint: false,
        });
    });

    it.each([408, 425, 429, 500, 502, 503, 504, 599])('retries on %i', (statusCode) => {
        expect(classifyAttempt({ statusCode, transportErrorClass: null }).verdict).toBe('retry');
    });

    it.each([301, 302, 307, 400, 401, 403, 404, 405, 422])('fails for good on %i', (statusCode) => {
        expect(classifyAttempt({ statusCode, transportErrorClass: null })).toEqual({
            verdict: 'fail',
            shouldDisableEndpoint: false,
        });
    });

    it('fails for good on 410 and disables the endpoint', () => {
        expect(classifyAttempt({ statusCode: 410, transportErrorClass: null })).toEqual({
            verdict: 'fail',
            shouldDisableEndpoint: true,
        });
    });

    it.each(['timeout', 'connection', 'dns', 'tls', 'response_too_large', 'unknown'])(
        'retries a transport failure of class %s',
        (transportErrorClass) => {
            expect(classifyAttempt({ statusCode: null, transportErrorClass }).verdict).toBe(
                'retry',
            );
        },
    );

    it('fails for good when the address was blocked by the SSRF guard', () => {
        expect(
            classifyAttempt({ statusCode: null, transportErrorClass: 'blocked_address' }).verdict,
        ).toBe('fail');
    });
});

describe('computeRetryDelayMs', () => {
    it('follows the table, with jitter between -20% and +20%', () => {
        expect(computeRetryDelayMs(1, 0.5)).toBe(30_000);
        expect(computeRetryDelayMs(1, 0)).toBe(24_000);
        expect(computeRetryDelayMs(1, 0.999999)).toBeCloseTo(36_000, -1);
        expect(computeRetryDelayMs(7, 0.5)).toBe(43_200_000);
    });

    it('keeps the delays increasing across attempts', () => {
        const delays = Array.from({ length: MAX_DELIVERY_ATTEMPTS - 1 }, (_, index) =>
            computeRetryDelayMs(index + 1, 0.5),
        );
        expect(delays).toEqual(
            [...delays].sort((earlierDelay, laterDelay) => earlierDelay - laterDelay),
        );
    });

    it('never goes past the last table entry for larger attempt counts', () => {
        expect(computeRetryDelayMs(50, 0.5)).toBe(43_200_000);
    });

    it('honours a longer Retry-After but never more than 6 hours', () => {
        expect(computeRetryDelayMs(1, 0.5, 300)).toBe(300_000);
        expect(computeRetryDelayMs(1, 0.5, 999_999)).toBe(6 * HOUR_MS);
    });

    it('ignores a Retry-After shorter than the table delay, or one that is not a number', () => {
        expect(computeRetryDelayMs(3, 0.5, 5)).toBe(600_000);
        expect(computeRetryDelayMs(3, 0.5, Number.NaN)).toBe(600_000);
        expect(computeRetryDelayMs(3, 0.5, -10)).toBe(600_000);
    });

    it('spreads all attempts over roughly a day', () => {
        let totalMs = 0;
        for (let attempt = 1; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1)
            totalMs += computeRetryDelayMs(attempt, 0.5);
        expect(totalMs).toBeGreaterThan(18 * HOUR_MS);
        expect(totalMs).toBeLessThan(26 * HOUR_MS);
    });
});

describe('decideDeliveryOutcome', () => {
    const baseAttempt = {
        statusCode: null,
        transportErrorClass: null,
        attemptsMade: 1,
        nowMs: NOW,
        randomValue: 0.5,
    };

    it('marks a 2xx delivered and does not count against the endpoint', () => {
        expect(decideDeliveryOutcome({ ...baseAttempt, statusCode: 200 })).toEqual({
            status: 'delivered',
            nextAttemptAt: null,
            shouldDisableEndpoint: false,
            countsAsEndpointFailure: false,
        });
    });

    it('schedules a retry from the current time for a 500', () => {
        const outcome = decideDeliveryOutcome({ ...baseAttempt, statusCode: 500 });
        expect(outcome.status).toBe('retrying');
        expect(outcome.nextAttemptAt).toBe(new Date(NOW + 30_000).toISOString());
        expect(outcome.countsAsEndpointFailure).toBe(true);
    });

    it('fails immediately on a permanent 4xx without scheduling anything', () => {
        expect(decideDeliveryOutcome({ ...baseAttempt, statusCode: 404 })).toMatchObject({
            status: 'failed',
            nextAttemptAt: null,
            shouldDisableEndpoint: false,
        });
    });

    it('fails and disables the endpoint on 410', () => {
        expect(decideDeliveryOutcome({ ...baseAttempt, statusCode: 410 })).toMatchObject({
            status: 'failed',
            shouldDisableEndpoint: true,
        });
    });

    it('dead-letters a retryable failure once the attempts are used up', () => {
        const lastRetry = decideDeliveryOutcome({
            ...baseAttempt,
            statusCode: 503,
            attemptsMade: MAX_DELIVERY_ATTEMPTS - 1,
        });
        expect(lastRetry.status).toBe('retrying');
        const exhausted = decideDeliveryOutcome({
            ...baseAttempt,
            statusCode: 503,
            attemptsMade: MAX_DELIVERY_ATTEMPTS,
        });
        expect(exhausted).toMatchObject({ status: 'failed', nextAttemptAt: null });
    });

    it('retries a timeout with no status code and passes Retry-After through', () => {
        const outcome = decideDeliveryOutcome({
            ...baseAttempt,
            transportErrorClass: 'timeout',
            retryAfterSeconds: 3600,
        });
        expect(outcome.status).toBe('retrying');
        expect(outcome.nextAttemptAt).toBe(new Date(NOW + HOUR_MS).toISOString());
    });
});

describe('shouldTripCircuitBreaker', () => {
    const lastHealthyMs = NOW - CIRCUIT_BREAKER_MIN_OUTAGE_MS - 1;

    it('opens only when there are enough failures AND the outage is long enough', () => {
        expect(
            shouldTripCircuitBreaker({
                consecutiveFailures: CIRCUIT_BREAKER_FAILURES,
                healthySinceMs: lastHealthyMs,
                nowMs: NOW,
            }),
        ).toBe(true);
    });

    it('stays closed for a burst of failures during a short outage', () => {
        expect(
            shouldTripCircuitBreaker({
                consecutiveFailures: CIRCUIT_BREAKER_FAILURES * 10,
                healthySinceMs: NOW - HOUR_MS,
                nowMs: NOW,
            }),
        ).toBe(false);
    });

    it('stays closed for a long outage with only a few failures', () => {
        expect(
            shouldTripCircuitBreaker({
                consecutiveFailures: CIRCUIT_BREAKER_FAILURES - 1,
                healthySinceMs: lastHealthyMs,
                nowMs: NOW,
            }),
        ).toBe(false);
    });
});
