import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import JoinSpaceDialog from './JoinSpaceDialog';

const requestToJoinSpace = vi.fn();

vi.mock('@/actions/collaboration-actions', () => ({
    requestToJoinSpace: (...args) => requestToJoinSpace(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));

const spaceIdForm = () => screen.getByPlaceholderText('Paste the space ID').closest('form');
const submitButton = () => screen.getByRole('button', { name: /Request to join|Sending/ });

function renderOpenDialog() {
    const onClose = vi.fn();
    const renderedDialog = render(
        <JoinSpaceDialog open onClose={onClose} initialSpaceId="space-1" />,
    );
    return { onClose, ...renderedDialog };
}

describe('JoinSpaceDialog', () => {
    beforeEach(() => vi.clearAllMocks());

    it('sends one request when submitted twice, and ignores Escape while it is saving', async () => {
        requestToJoinSpace.mockReturnValue(new Promise(() => {}));
        const { onClose } = renderOpenDialog();

        fireEvent.submit(spaceIdForm());
        fireEvent.submit(spaceIdForm());
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(requestToJoinSpace).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
        expect(submitButton().disabled).toBe(true);
    });

    it('stays locked after success while it closes, then starts fresh when opened again', async () => {
        requestToJoinSpace.mockResolvedValue({ error: null });
        const { onClose, rerender } = renderOpenDialog();

        fireEvent.submit(spaceIdForm());
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        expect(submitButton().disabled).toBe(true);

        rerender(<JoinSpaceDialog open={false} onClose={onClose} initialSpaceId="space-1" />);
        rerender(<JoinSpaceDialog open onClose={onClose} initialSpaceId="space-1" />);

        expect(submitButton().disabled).toBe(false);
    });

    it('unlocks and shows the error when the request is rejected', async () => {
        requestToJoinSpace.mockResolvedValue({ error: 'Already a member' });
        renderOpenDialog();

        fireEvent.submit(spaceIdForm());

        await screen.findByText('Already a member');
        expect(submitButton().disabled).toBe(false);
    });
});
