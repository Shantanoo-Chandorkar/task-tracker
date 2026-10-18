import { describe, expect, it } from 'vitest';
import { computeElapsedSeconds, isSessionStale, formatElapsedDuration } from './session-clock';

describe('computeElapsedSeconds', () => {
    it('adds the current running segment to the sealed accumulated seconds', () => {
        const session = {
            status: 'running',
            accumulated_seconds: 100,
            last_resumed_at: '2026-10-18T10:00:00.000Z',
        };
        const now = new Date('2026-10-18T10:00:30.000Z');
        expect(computeElapsedSeconds(session, now)).toBe(130);
    });

    it('ignores the running segment for a paused session', () => {
        const session = {
            status: 'paused',
            accumulated_seconds: 100,
            last_resumed_at: '2026-10-18T10:00:00.000Z',
        };
        const now = new Date('2026-10-18T10:00:30.000Z');
        expect(computeElapsedSeconds(session, now)).toBe(100);
    });

    it('ignores the running segment for a completed session', () => {
        const session = {
            status: 'completed',
            accumulated_seconds: 100,
            last_resumed_at: '2026-10-18T10:00:00.000Z',
        };
        const now = new Date('2026-10-18T10:00:30.000Z');
        expect(computeElapsedSeconds(session, now)).toBe(100);
    });

    it('treats a running session with no last_resumed_at as sealed time only', () => {
        const session = { status: 'running', accumulated_seconds: 100, last_resumed_at: null };
        expect(computeElapsedSeconds(session, new Date('2026-10-18T10:00:30.000Z'))).toBe(100);
    });

    it('never goes negative when now is before last_resumed_at (clock skew)', () => {
        const session = {
            status: 'running',
            accumulated_seconds: 100,
            last_resumed_at: '2026-10-18T10:00:30.000Z',
        };
        const now = new Date('2026-10-18T10:00:00.000Z');
        expect(computeElapsedSeconds(session, now)).toBe(100);
    });

    it('floors a sub-second running segment down to whole seconds', () => {
        const session = {
            status: 'running',
            accumulated_seconds: 0,
            last_resumed_at: '2026-10-18T10:00:00.000Z',
        };
        const now = new Date('2026-10-18T10:00:00.999Z');
        expect(computeElapsedSeconds(session, now)).toBe(0);
    });
});

describe('isSessionStale', () => {
    it('is false for a running session right at the threshold', () => {
        const session = { status: 'running', last_resumed_at: '2026-10-17T10:00:00.000Z' };
        expect(isSessionStale(session, new Date('2026-10-18T10:00:00.000Z'))).toBe(false);
    });

    it('is true for a running session one millisecond past the threshold', () => {
        const session = { status: 'running', last_resumed_at: '2026-10-17T10:00:00.000Z' };
        expect(isSessionStale(session, new Date('2026-10-18T10:00:00.001Z'))).toBe(true);
    });

    it('is false for a recently resumed running session', () => {
        const session = { status: 'running', last_resumed_at: '2026-10-18T09:00:00.000Z' };
        expect(isSessionStale(session, new Date('2026-10-18T10:00:00.000Z'))).toBe(false);
    });

    it('is false for a paused session regardless of how old last_resumed_at is', () => {
        const session = { status: 'paused', last_resumed_at: '2020-01-01T00:00:00.000Z' };
        expect(isSessionStale(session, new Date('2026-10-18T10:00:00.000Z'))).toBe(false);
    });

    it('is false for a completed session regardless of how old last_resumed_at is', () => {
        const session = { status: 'completed', last_resumed_at: '2020-01-01T00:00:00.000Z' };
        expect(isSessionStale(session, new Date('2026-10-18T10:00:00.000Z'))).toBe(false);
    });

    it('is false for a running session with no last_resumed_at', () => {
        const session = { status: 'running', last_resumed_at: null };
        expect(isSessionStale(session, new Date('2026-10-18T10:00:00.000Z'))).toBe(false);
    });
});

describe('formatElapsedDuration', () => {
    it('formats under a minute as mm:ss', () => {
        expect(formatElapsedDuration(5)).toBe('0:05');
    });

    it('formats under an hour as mm:ss', () => {
        expect(formatElapsedDuration(125)).toBe('2:05');
    });

    it('formats an hour or more as h:mm:ss', () => {
        expect(formatElapsedDuration(3725)).toBe('1:02:05');
    });

    it('pads minutes and seconds inside an hour value, but not the hour itself', () => {
        expect(formatElapsedDuration(36000)).toBe('10:00:00');
    });
});
