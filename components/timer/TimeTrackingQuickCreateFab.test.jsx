import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TimeTrackingQuickCreateFab from './TimeTrackingQuickCreateFab';

const sessionsState = vi.hoisted(() => ({ sessions: [] }));

vi.mock('@/hooks/useTimeSessionsQuery', () => ({
    useTimeSessionsQuery: () => ({ data: sessionsState.sessions }),
}));

const capturedSheetProps = vi.hoisted(() => ({
    standaloneProps: null,
    taskProps: null,
    habitProps: null,
}));

vi.mock('./StartStandaloneTimerSheet', () => ({
    default: function StartStandaloneTimerSheetStub(props) {
        capturedSheetProps.standaloneProps = props;
        return null;
    },
}));
vi.mock('./StartTaskTimerSheet', () => ({
    default: function StartTaskTimerSheetStub(props) {
        capturedSheetProps.taskProps = props;
        return null;
    },
}));
vi.mock('./StartHabitTimerSheet', () => ({
    default: function StartHabitTimerSheetStub(props) {
        capturedSheetProps.habitProps = props;
        return null;
    },
}));

afterEach(() => {
    cleanup();
    sessionsState.sessions = [];
    capturedSheetProps.standaloneProps = null;
    capturedSheetProps.taskProps = null;
    capturedSheetProps.habitProps = null;
});

function openMenu() {
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Start a timer...' }), {
        button: 0,
        ctrlKey: false,
    });
}

describe('TimeTrackingQuickCreateFab', () => {
    it('opens the standalone sheet when the standalone session is not already live', () => {
        render(<TimeTrackingQuickCreateFab className="" />);
        openMenu();

        fireEvent.click(screen.getByRole('menuitem', { name: /start standalone timer/i }));

        expect(capturedSheetProps.standaloneProps.open).toBe(true);
    });

    it('opens the task sheet from its menu item', () => {
        render(<TimeTrackingQuickCreateFab className="" />);
        openMenu();

        fireEvent.click(screen.getByRole('menuitem', { name: /start task timer/i }));

        expect(capturedSheetProps.taskProps.open).toBe(true);
    });

    it('opens the habit sheet from its menu item', () => {
        render(<TimeTrackingQuickCreateFab className="" />);
        openMenu();

        fireEvent.click(screen.getByRole('menuitem', { name: /start habit timer/i }));

        expect(capturedSheetProps.habitProps.open).toBe(true);
    });

    it('disables the standalone item and does not open its sheet when one is already live', () => {
        sessionsState.sessions = [{ task_id: null, habit_id: null, status: 'running' }];
        render(<TimeTrackingQuickCreateFab className="" />);
        openMenu();

        const standaloneItem = screen.getByRole('menuitem', { name: /start standalone timer/i });
        expect(standaloneItem.getAttribute('aria-disabled')).toBe('true');

        fireEvent.click(standaloneItem);

        expect(capturedSheetProps.standaloneProps.open).toBe(false);
    });
});
