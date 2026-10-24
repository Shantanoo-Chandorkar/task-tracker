import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
        advanceBlock: vi.fn(),
    }),
}));
vi.mock('@/hooks/useTimerTemplatesQuery', () => ({
    useTimerTemplatesQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useHabitsQuery', () => ({ useHabitsQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('sonner', () => ({
    toast: { loading: () => 'toast-id', success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

// Radix Select/Command (the start sheets) and dialogs (TimerTemplateManager) need these, even closed
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

const NOW = '2026-10-18T12:00:00.000Z';

function renderPage() {
    const queryClient = new QueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            <TimerPageContent />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    sessions = [];
});
afterEach(() => vi.useRealTimers());

describe('TimerPageContent', () => {
    it('switches to the template manager on the Templates tab', () => {
        renderPage();

        fireEvent.click(screen.getByRole('tab', { name: 'Templates' }));

        expect(screen.getByText('No templates yet.')).toBeTruthy();
        expect(screen.queryByLabelText('Session label')).toBeNull();
    });

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
        renderPage();

        expect(screen.getByText('Task work')).toBeTruthy();
        expect(screen.queryByText('Old one')).toBeNull();
    });

    it('keeps the Standalone button enabled when no standalone session is live, even with a habit session live', () => {
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
        renderPage();

        expect(screen.getByRole('button', { name: /start standalone timer/i }).disabled).toBe(
            false,
        );
        expect(screen.queryByText(/you already have a running timer/i)).toBeNull();
    });

    it('disables the Standalone button and shows a message while one is already live', () => {
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
        renderPage();

        expect(screen.getByRole('button', { name: /start standalone timer/i }).disabled).toBe(true);
        expect(screen.getByText(/you already have a running timer/i)).toBeTruthy();
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
        renderPage();

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
        renderPage();

        expect(screen.queryByText('You left this running')).toBeNull();
    });

    it('stacks two live sessions in the same spaced list', () => {
        sessions = [
            {
                id: 'session-1',
                label: 'First session',
                habit_id: null,
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: NOW,
            },
            {
                id: 'session-2',
                label: 'Second session',
                habit_id: null,
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: NOW,
            },
        ];
        const { container } = renderPage();

        const sessionList = container.querySelector('.space-y-4');
        expect(sessionList).toBeTruthy();
        expect(sessionList.textContent).toContain('First session');
        expect(sessionList.textContent).toContain('Second session');
    });

    it('does not offer a fullscreen trigger when 2+ sessions are live', () => {
        sessions = [
            {
                id: 'session-1',
                label: 'First session',
                habit_id: null,
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: NOW,
            },
            {
                id: 'session-2',
                label: 'Second session',
                habit_id: null,
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: NOW,
            },
        ];
        renderPage();

        expect(screen.queryByText('View fullscreen')).toBeNull();
    });

    it('enters and exits fullscreen via the minimize button', () => {
        sessions = [
            {
                id: 'session-1',
                label: 'Solo session',
                habit_id: null,
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: NOW,
            },
        ];
        renderPage();

        expect(screen.queryByText('Minimize, back to normal view')).toBeNull();

        fireEvent.click(screen.getByText('View fullscreen'));
        expect(screen.getByText('Minimize, back to normal view')).toBeTruthy();

        fireEvent.click(screen.getByText('Minimize, back to normal view'));
        expect(screen.queryByText('Minimize, back to normal view')).toBeNull();
        expect(screen.getByText('View fullscreen')).toBeTruthy();
    });

    it('excludes the fullscreen session from the normal list while active', () => {
        sessions = [
            {
                id: 'session-1',
                label: 'Solo session',
                habit_id: null,
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: NOW,
            },
        ];
        renderPage();

        fireEvent.click(screen.getByText('View fullscreen'));

        expect(screen.getAllByText('Solo session')).toHaveLength(1);
    });

    it('auto-exits fullscreen when a 2nd session goes live', () => {
        sessions = [
            {
                id: 'session-1',
                label: 'Solo session',
                habit_id: null,
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: NOW,
            },
        ];
        const queryClient = new QueryClient();
        const { rerender } = render(
            <QueryClientProvider client={queryClient}>
                <TimerPageContent />
            </QueryClientProvider>,
        );

        fireEvent.click(screen.getByText('View fullscreen'));
        expect(screen.getByText('Minimize, back to normal view')).toBeTruthy();

        sessions = [
            ...sessions,
            {
                id: 'session-2',
                label: 'New session',
                habit_id: null,
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: NOW,
            },
        ];
        rerender(
            <QueryClientProvider client={queryClient}>
                <TimerPageContent />
            </QueryClientProvider>,
        );

        expect(screen.queryByText('Minimize, back to normal view')).toBeNull();
    });

    it('auto-exits fullscreen when the fullscreen session completes', () => {
        sessions = [
            {
                id: 'session-1',
                label: 'Solo session',
                habit_id: null,
                task_id: null,
                status: 'running',
                accumulated_seconds: 0,
                last_resumed_at: NOW,
            },
        ];
        const queryClient = new QueryClient();
        const { rerender } = render(
            <QueryClientProvider client={queryClient}>
                <TimerPageContent />
            </QueryClientProvider>,
        );

        fireEvent.click(screen.getByText('View fullscreen'));
        expect(screen.getByText('Minimize, back to normal view')).toBeTruthy();

        sessions = [{ ...sessions[0], status: 'completed' }];
        rerender(
            <QueryClientProvider client={queryClient}>
                <TimerPageContent />
            </QueryClientProvider>,
        );

        expect(screen.queryByText('Minimize, back to normal view')).toBeNull();
    });
});
