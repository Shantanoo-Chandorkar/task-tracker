import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ModalShell from '@/components/custom/ModalShell';
import { AlertDialogAction, AlertDialogCancel } from './alert-dialog';

vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));

function renderConfirmPopup({ onClose, onConfirm }) {
    render(
        <ModalShell
            open
            onClose={onClose}
            variant="alert"
            title="Delete it?"
            footer={
                <>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
                </>
            }
        />,
    );
}

describe('AlertDialogAction', () => {
    it('runs the caller handler but does not close the popup, so the caller decides when', () => {
        const onClose = vi.fn();
        const onConfirm = vi.fn();
        renderConfirmPopup({ onClose, onConfirm });

        fireEvent.click(screen.getByText('Delete'));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('still closes the popup from Cancel', () => {
        const onClose = vi.fn();
        renderConfirmPopup({ onClose, onConfirm: vi.fn() });

        fireEvent.click(screen.getByText('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
