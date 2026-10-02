'use client';

import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The "..." menu every reorderable row shares, so Edit, Move and Delete look and behave the same everywhere.
 *
 * @param {object} props
 * @param {string} props.label - Accessible name of the button, ideally naming the row ("More actions for Groceries").
 * @param {boolean} [props.isPending] - Shows a spinner and locks the button while a row action runs.
 * @param {boolean} [props.isCompact] - Smaller button for dense rows such as task rows.
 * @param {import('react').ReactNode} props.children - The menu items, grouped with `DropdownMenuSeparator`.
 */
export default function RowActionsMenu({ label, isPending = false, isCompact = false, children }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={`hit-area [--hit-size:44px] lg:[--hit-size:24px] flex-shrink-0 text-muted-foreground hover:text-foreground ${isCompact ? 'h-6 w-6' : 'h-7 w-7'}`}
                    disabled={isPending}
                    aria-label={label}
                >
                    {isPending ? (
                        <Loader size="xs" />
                    ) : (
                        <MoreHorizontal className={isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
                {children}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/**
 * Move up and Move down items for a row's menu; the caller puts a divider on each side.
 *
 * @param {object} props
 * @param {boolean} props.canMoveUp - False on the first row, or when the row above cannot be swapped with.
 * @param {boolean} props.canMoveDown - False on the last row, or when the row below cannot be swapped with.
 * @param {Function} props.onMoveUp - Moves the row one place up.
 * @param {Function} props.onMoveDown - Moves the row one place down.
 * @param {boolean} [props.isDisabled] - Disables both, e.g. for a member who may not edit the row.
 */
export function MoveMenuItems({
    canMoveUp,
    canMoveDown,
    onMoveUp,
    onMoveDown,
    isDisabled = false,
}) {
    return (
        <>
            <DropdownMenuItem onSelect={onMoveUp} disabled={isDisabled || !canMoveUp}>
                Move up
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onMoveDown} disabled={isDisabled || !canMoveDown}>
                Move down
            </DropdownMenuItem>
        </>
    );
}
