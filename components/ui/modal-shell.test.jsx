import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ModalShell from './modal-shell';

vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));

function renderModal({ isBusy, onClose }) {
    render(
        <ModalShell open onClose={onClose} title="New List" isBusy={isBusy}>
            <p>form body</p>
        </ModalShell>,
    );
}

describe('ModalShell busy', () => {
    it('ignores Escape and hides the close button while a save is in flight', () => {
        const onClose = vi.fn();
        renderModal({ isBusy: true, onClose });

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).not.toHaveBeenCalled();
        expect(screen.queryByText('Close')).toBeNull();
        expect(screen.getByText('form body')).toBeTruthy();
    });

    it('closes on Escape and shows the close button when idle', () => {
        const onClose = vi.fn();
        renderModal({ isBusy: false, onClose });

        expect(screen.getByText('Close')).toBeTruthy();
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
