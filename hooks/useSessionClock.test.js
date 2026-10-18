import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionClock } from './useSessionClock';

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T10:00:00.000Z'));
});
afterEach(() => {
    vi.useRealTimers();
});

describe('useSessionClock', () => {
    it('seeds from the session on first render', () => {
        const session = {
            status: 'running',
            accumulated_seconds: 100,
            last_resumed_at: '2026-10-18T10:00:00.000Z',
        };

        const { result } = renderHook(() => useSessionClock(session));

        expect(result.current).toBe(100);
    });

    it('ticks once a second while the session is running', () => {
        const session = {
            status: 'running',
            accumulated_seconds: 0,
            last_resumed_at: '2026-10-18T10:00:00.000Z',
        };

        const { result } = renderHook(() => useSessionClock(session));

        act(() => {
            vi.advanceTimersByTime(3000);
        });

        expect(result.current).toBe(3);
    });

    it('does not tick while the session is paused', () => {
        const session = {
            status: 'paused',
            accumulated_seconds: 100,
            last_resumed_at: null,
        };

        const { result } = renderHook(() => useSessionClock(session));

        act(() => {
            vi.advanceTimersByTime(5000);
        });

        expect(result.current).toBe(100);
    });

    it('snaps to the new session value when the server row changes', () => {
        const runningSession = {
            status: 'running',
            accumulated_seconds: 0,
            last_resumed_at: '2026-10-18T10:00:00.000Z',
        };

        const { result, rerender } = renderHook(({ session }) => useSessionClock(session), {
            initialProps: { session: runningSession },
        });

        act(() => {
            vi.advanceTimersByTime(3000);
        });
        expect(result.current).toBe(3);

        const pausedSession = { status: 'paused', accumulated_seconds: 42, last_resumed_at: null };
        rerender({ session: pausedSession });

        expect(result.current).toBe(42);
    });
});
