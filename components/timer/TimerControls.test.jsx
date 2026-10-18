import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import TimerControls from './TimerControls';

const pause = vi.fn().mockResolvedValue(true);
const resume = vi.fn().mockResolvedValue(true);
const complete = vi.fn().mockResolvedValue(true);
vi.mock('@/hooks/useTimeSessionActions', () => ({
    useTimeSessionActions: () => ({ pause, resume, complete }),
}));

describe('TimerControls', () => {
    it('shows Pause and Complete for a running session, and pauses on click', () => {
        render(<TimerControls session={{ id: 'session-1', status: 'running' }} />);

        expect(screen.getByText('Pause')).toBeTruthy();
        expect(screen.getByText('Complete')).toBeTruthy();
        expect(screen.queryByText('Resume')).toBeNull();

        fireEvent.click(screen.getByText('Pause'));
        expect(pause).toHaveBeenCalledWith('session-1');
    });

    it('shows Resume and Complete for a paused session, and resumes on click', () => {
        render(<TimerControls session={{ id: 'session-1', status: 'paused' }} />);

        expect(screen.getByText('Resume')).toBeTruthy();
        expect(screen.queryByText('Pause')).toBeNull();

        fireEvent.click(screen.getByText('Resume'));
        expect(resume).toHaveBeenCalledWith('session-1');
    });

    it('completes a session on click regardless of status', () => {
        render(<TimerControls session={{ id: 'session-1', status: 'running' }} />);

        fireEvent.click(screen.getByText('Complete'));
        expect(complete).toHaveBeenCalledWith('session-1');
    });

    it('disables both buttons while a control is pending', async () => {
        let finishPause;
        pause.mockReturnValueOnce(new Promise((resolve) => (finishPause = resolve)));
        render(<TimerControls session={{ id: 'session-1', status: 'running' }} />);

        fireEvent.click(screen.getByText('Pause'));

        expect(screen.getByText('Pause').closest('button').disabled).toBe(true);
        expect(screen.getByText('Complete').closest('button').disabled).toBe(true);

        finishPause(true);
    });

    it('shows the loader only on the button that was clicked, not the other one', async () => {
        let finishPause;
        pause.mockReturnValueOnce(new Promise((resolve) => (finishPause = resolve)));
        render(<TimerControls session={{ id: 'session-1', status: 'running' }} />);

        fireEvent.click(screen.getByText('Pause'));

        const pauseButton = screen.getByText('Pause').closest('button');
        const completeButton = screen.getByText('Complete').closest('button');
        expect(within(pauseButton).getByRole('status', { name: 'Loading' })).toBeTruthy();
        expect(within(completeButton).queryByRole('status', { name: 'Loading' })).toBeNull();

        finishPause(true);
    });
});
