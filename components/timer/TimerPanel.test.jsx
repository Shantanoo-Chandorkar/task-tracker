import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TimerPanel from './TimerPanel';

vi.mock('@/hooks/useTimeSessionActions', () => ({
    useTimeSessionActions: () => ({
        pause: vi.fn(),
        resume: vi.fn(),
        complete: vi.fn(),
        advanceBlock: vi.fn(),
    }),
}));

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:30.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('TimerPanel', () => {
    it('shows the session label and its elapsed time', () => {
        render(
            <TimerPanel
                session={{
                    id: 'session-1',
                    label: 'Deep work',
                    status: 'running',
                    accumulated_seconds: 0,
                    last_resumed_at: '2026-10-18T12:00:00.000Z',
                }}
            />,
        );

        expect(screen.getByText('Deep work')).toBeTruthy();
        expect(screen.getByText('0:30')).toBeTruthy();
    });

    it('falls back to a placeholder when the session has no label', () => {
        render(
            <TimerPanel
                session={{
                    id: 'session-1',
                    label: null,
                    status: 'paused',
                    accumulated_seconds: 90,
                    last_resumed_at: null,
                }}
            />,
        );

        expect(screen.getByText('Untitled session')).toBeTruthy();
        expect(screen.getByText('1:30')).toBeTruthy();
    });

    it('falls back to the attached task’s title when the session has no label', () => {
        render(
            <TimerPanel
                session={{
                    id: 'session-1',
                    label: null,
                    tasks: { title: 'Write report' },
                    status: 'running',
                    accumulated_seconds: 0,
                    last_resumed_at: '2026-10-18T12:00:00.000Z',
                }}
            />,
        );

        expect(screen.getByText('Write report')).toBeTruthy();
    });

    it('shows the current block when the session follows a template', () => {
        render(
            <TimerPanel
                session={{
                    id: 'session-1',
                    label: 'Deep work',
                    status: 'running',
                    accumulated_seconds: 0,
                    last_resumed_at: '2026-10-18T12:00:00.000Z',
                    block_index: 0,
                    timer_templates: {
                        blocks: [
                            { kind: 'work', label: 'Focus', durationSeconds: 1500 },
                            { kind: 'break', label: 'Break', durationSeconds: 300 },
                        ],
                    },
                }}
            />,
        );

        expect(screen.getByText('Block 1 of 2: Focus')).toBeTruthy();
    });
});
