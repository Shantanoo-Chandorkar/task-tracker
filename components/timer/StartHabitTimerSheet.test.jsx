import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StartHabitTimerSheet from './StartHabitTimerSheet';

vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => false }));

const habitsState = vi.hoisted(() => ({ habits: [] }));
const sessionsState = vi.hoisted(() => ({ sessions: [] }));
const startMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useHabitsQuery', () => ({
    useHabitsQuery: () => ({ data: habitsState.habits }),
}));
vi.mock('@/hooks/useTimeSessionsQuery', () => ({
    useTimeSessionsQuery: () => ({ data: sessionsState.sessions }),
}));
vi.mock('@/hooks/useTimeSessionActions', () => ({
    useTimeSessionActions: () => ({ start: startMock }),
}));

// cmdk and Radix measure and scroll elements, which jsdom does not implement
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
    habitsState.habits = [];
    sessionsState.sessions = [];
    startMock.mockReset();
});

afterEach(cleanup);

function renderSheet(onClose = vi.fn()) {
    render(<StartHabitTimerSheet open onClose={onClose} />);
    return onClose;
}

describe('StartHabitTimerSheet', () => {
    it('says there are no habits yet when the list is empty', () => {
        renderSheet();
        expect(screen.getByText('You have no habits yet.')).toBeTruthy();
    });

    it('lists habits, marking a live one as already tracking', () => {
        habitsState.habits = [
            { id: 'habit-1', title: 'Read' },
            { id: 'habit-2', title: 'Meditate' },
        ];
        sessionsState.sessions = [{ task_id: null, habit_id: 'habit-2', status: 'running' }];
        renderSheet();

        expect(screen.getByText('Read')).toBeTruthy();
        expect(screen.getByText('Meditate')).toBeTruthy();
        expect(screen.getByText('Already tracking')).toBeTruthy();
    });

    it('starts a timer for the selected habit and closes the sheet on success', async () => {
        habitsState.habits = [{ id: 'habit-1', title: 'Read' }];
        startMock.mockResolvedValue(true);
        const onClose = renderSheet();

        fireEvent.click(screen.getByText('Read'));

        await waitFor(() => expect(startMock).toHaveBeenCalledWith({ habitId: 'habit-1' }));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('leaves the sheet open when starting the timer fails', async () => {
        habitsState.habits = [{ id: 'habit-1', title: 'Read' }];
        startMock.mockResolvedValue(false);
        const onClose = renderSheet();

        fireEvent.click(screen.getByText('Read'));

        await waitFor(() => expect(startMock).toHaveBeenCalled());
        expect(onClose).not.toHaveBeenCalled();
    });

    it('does not start a timer for a habit that already has a live session', () => {
        habitsState.habits = [{ id: 'habit-1', title: 'Read' }];
        sessionsState.sessions = [{ task_id: null, habit_id: 'habit-1', status: 'running' }];
        renderSheet();

        fireEvent.click(screen.getByText('Read'));

        expect(startMock).not.toHaveBeenCalled();
    });
});
