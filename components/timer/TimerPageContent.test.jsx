import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TimerPageContent from './TimerPageContent';

let sessions;
vi.mock('@/hooks/useTimeSessionsQuery', () => ({
    useTimeSessionsQuery: () => ({ data: sessions }),
}));
vi.mock('@/hooks/useTimeSessionActions', () => ({
    useTimeSessionActions: () => ({
        start: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        complete: vi.fn(),
        discard: vi.fn(),
    }),
}));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));

const NOW = '2026-10-18T12:00:00.000Z';

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    sessions = [];
});
afterEach(() => vi.useRealTimers());

describe('TimerPageContent', () => {
    it('shows a panel for every live session and hides completed ones', () => {
        sessions = [
            {
                id: 'session-1',
                label: 'Task work',
                habit_id: 'habit-1',
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: NOW,
            },
            {
                id: 'session-2',
                label: 'Old one',
                habit_id: null,
                task_id: null,
                status: 'completed',
                accumulated_seconds: 500,
                last_resumed_at: null,
            },
        ];
        render(<TimerPageContent />);

        expect(screen.getByText('Task work')).toBeTruthy();
        expect(screen.queryByText('Old one')).toBeNull();
    });

    it('shows the start form when no standalone session is live, even with a habit session live', () => {
        sessions = [
            {
                id: 'session-1',
                label: 'Task work',
                habit_id: 'habit-1',
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: NOW,
            },
        ];
        render(<TimerPageContent />);

        expect(screen.getByLabelText('Session label')).toBeTruthy();
    });

    it('hides the start form while a standalone session is already live', () => {
        sessions = [
            {
                id: 'session-1',
                label: 'Deep work',
                habit_id: null,
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: NOW,
            },
        ];
        render(<TimerPageContent />);

        expect(screen.queryByLabelText('Session label')).toBeNull();
    });

    it('shows a stale-session prompt for a running session left unattended over a day', () => {
        sessions = [
            {
                id: 'session-1',
                label: 'Forgot this',
                habit_id: null,
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: '2026-10-17T10:00:00.000Z',
            },
        ];
        render(<TimerPageContent />);

        expect(screen.getByText('You left this running')).toBeTruthy();
    });

    it('does not show a stale-session prompt for a recently resumed session', () => {
        sessions = [
            {
                id: 'session-1',
                label: 'Fresh',
                habit_id: null,
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: '2026-10-18T11:00:00.000Z',
            },
        ];
        render(<TimerPageContent />);

        expect(screen.queryByText('You left this running')).toBeNull();
    });
});
