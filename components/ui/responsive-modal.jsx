'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsDesktop } from '@/hooks/useIsDesktop';

/**
 * Shared modal container for every create/edit surface (Task, Space, List).
 * Renders a centered Dialog at `lg` (1024px) and above, a bottom Sheet below
 * it — the container-level behavior (animation, sizing, breakpoint) lives
 * here once, so every form using it changes together.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the modal is open
 * @param {Function} props.onClose - Called when the modal should close
 * @param {string} props.title - Modal title
 * @param {import('react').ReactNode} props.children - Form content
 */
export default function ResponsiveModal({ open, onClose, title, children }) {
    const isDesktop = useIsDesktop();

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                    </DialogHeader>
                    {children}
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>{title}</SheetTitle>
                </SheetHeader>
                {children}
            </SheetContent>
        </Sheet>
    );
}
