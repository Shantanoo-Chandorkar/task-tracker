import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StaleSessionPrompt from './StaleSessionPrompt';

const complete = vi.fn();
const discard = vi.fn();
vi.mock('@/hooks/useTimeSessionActions', () => ({
    useTimeSessionActions: () => ({ complete, discard }),
}));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));

const SESSION = { id: 'session-1', status: 'running' };

beforeEach(() => {
    complete.mockReset().mockResolvedValue(true);
    discard.mockReset().mockResolvedValue(true);
});

describe('StaleSessionPrompt', () => {
    it('shows the "left this running" warning', () => {
        render(<StaleSessionPrompt session={SESSION} />);

        expect(screen.getByText('You left this running')).toBeTruthy();
    });

    it('completes the session when Keep is pressed', () => {
        render(<StaleSessionPrompt session={SESSION} />);

        fireEvent.click(screen.getByText('Keep'));

        expect(complete).toHaveBeenCalledWith('session-1');
        expect(discard).not.toHaveBeenCalled();
    });

    it('discards the session when Discard is pressed', () => {
        render(<StaleSessionPrompt session={SESSION} />);

        fireEvent.click(screen.getByText('Discard'));

        expect(discard).toHaveBeenCalledWith('session-1');
        expect(complete).not.toHaveBeenCalled();
    });

    it('disables both Keep and Discard while either one is pending', () => {
        let finishKeep;
        complete.mockReturnValueOnce(new Promise((resolve) => (finishKeep = resolve)));
        render(<StaleSessionPrompt session={SESSION} />);

        fireEvent.click(screen.getByText('Keep'));

        expect(screen.getByText('Keep').closest('button').disabled).toBe(true);
        expect(screen.getByText('Discard').closest('button').disabled).toBe(true);

        finishKeep(true);
    });
});
