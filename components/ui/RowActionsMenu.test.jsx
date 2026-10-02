import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RowActionsMenu, { MoveMenuItems } from './RowActionsMenu';
import { DropdownMenuItem, DropdownMenuSeparator } from './dropdown-menu';

// Radix positions the menu with a ResizeObserver, which jsdom does not provide
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

afterEach(cleanup);

function openMenu() {
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions for Groceries' }), {
        button: 0,
        ctrlKey: false,
    });
}

function renderMenu(moveProps = {}, menuProps = {}) {
    const onEdit = vi.fn();
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();
    render(
        <RowActionsMenu label="More actions for Groceries" {...menuProps}>
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <MoveMenuItems
                canMoveUp
                canMoveDown
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                {...moveProps}
            />
        </RowActionsMenu>,
    );
    openMenu();
    return { onEdit, onMoveUp, onMoveDown };
}

describe('RowActionsMenu', () => {
    it('shows one "..." button named after the row', () => {
        render(<RowActionsMenu label="More actions for Groceries">{null}</RowActionsMenu>);

        expect(screen.getByRole('button', { name: 'More actions for Groceries' })).toBeTruthy();
    });

    it('opens to the items it was given, with the move items between dividers', async () => {
        renderMenu();

        expect(await screen.findByRole('menuitem', { name: 'Edit' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: 'Move up' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: 'Move down' })).toBeTruthy();
        expect(screen.getAllByRole('separator').length).toBeGreaterThanOrEqual(1);
    });

    it('runs the move callbacks', async () => {
        const { onMoveUp, onMoveDown } = renderMenu();

        fireEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));
        expect(onMoveUp).toHaveBeenCalledTimes(1);
        expect(onMoveDown).not.toHaveBeenCalled();
    });

    it('disables Move up on the first row and Move down on the last', async () => {
        renderMenu({ canMoveUp: false, canMoveDown: false });

        expect(
            (await screen.findByRole('menuitem', { name: 'Move up' })).getAttribute(
                'aria-disabled',
            ),
        ).toBe('true');
        expect(
            screen.getByRole('menuitem', { name: 'Move down' }).getAttribute('aria-disabled'),
        ).toBe('true');
    });

    it('does not run a disabled move item', async () => {
        const { onMoveUp } = renderMenu({ canMoveUp: false });

        fireEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));

        expect(onMoveUp).not.toHaveBeenCalled();
    });

    it('disables both move items when the whole row is read-only', async () => {
        renderMenu({ isDisabled: true });

        for (const name of ['Move up', 'Move down']) {
            expect(
                (await screen.findByRole('menuitem', { name })).getAttribute('aria-disabled'),
            ).toBe('true');
        }
    });

    it('swaps the icon for a spinner and locks the button while a row action is pending', () => {
        render(
            <RowActionsMenu label="More actions for Groceries" isPending>
                {null}
            </RowActionsMenu>,
        );

        const trigger = screen.getByRole('button', { name: /More actions for Groceries/ });
        expect(trigger.disabled).toBe(true);
        expect(screen.getByRole('status')).toBeTruthy();
    });
});
