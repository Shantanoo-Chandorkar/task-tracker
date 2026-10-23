import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FullscreenTimerOverlay from './FullscreenTimerOverlay';

const pause = vi.fn();
const resume = vi.fn();
const complete = vi.fn();
const advanceBlock = vi.fn();
vi.mock('@/hooks/useTimeSessionActions', () => ({
    useTimeSessionActions: () => ({ pause, resume, complete, advanceBlock }),
}));

const SESSION = {
    id: 'session-1',
    label: 'Deep work',
    status: 'running',
    accumulated_seconds: 0,
    last_resumed_at: '2026-10-18T12:00:00.000Z',
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:30.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('FullscreenTimerOverlay', () => {
    it('shows the session label and elapsed time', () => {
        render(<FullscreenTimerOverlay sessions={[SESSION]} onExit={vi.fn()} />);

        expect(screen.getByText('Deep work')).toBeTruthy();
        expect(screen.getByText('0:30')).toBeTruthy();
    });

    it('shows the current block when the session follows a template', () => {
        render(
            <FullscreenTimerOverlay
                sessions={[
                    {
                        ...SESSION,
                        block_index: 0,
                        timer_templates: {
                            blocks: [
                                { kind: 'work', label: 'Focus', durationSeconds: 1500 },
                                { kind: 'break', label: 'Break', durationSeconds: 300 },
                            ],
                        },
                    },
                ]}
                onExit={vi.fn()}
            />,
        );

        expect(screen.getByText('Block 1 of 2: Focus')).toBeTruthy();
    });

    it('calls onExit when the minimize button is clicked', () => {
        const onExit = vi.fn();
        render(<FullscreenTimerOverlay sessions={[SESSION]} onExit={onExit} />);

        fireEvent.click(screen.getByText('Minimize, back to normal view'));
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('calls onExit on Escape', () => {
        const onExit = vi.fn();
        render(<FullscreenTimerOverlay sessions={[SESSION]} onExit={onExit} />);

        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('still runs Pause through the reused TimerControls', () => {
        render(<FullscreenTimerOverlay sessions={[SESSION]} onExit={vi.fn()} />);

        fireEvent.click(screen.getByText('Pause'));
        expect(pause).toHaveBeenCalledWith('session-1');
    });

    it('still runs Complete through the reused TimerControls', () => {
        render(<FullscreenTimerOverlay sessions={[SESSION]} onExit={vi.fn()} />);

        fireEvent.click(screen.getByText('Complete'));
        expect(complete).toHaveBeenCalledWith('session-1');
    });
});
