'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { useIsDesktop } from '@/hooks/useIsDesktop';

/**
 * Shared modal container for every create/edit form - centered Dialog at `lg`+, bottom Sheet below it.
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
                        <DialogDescription className="sr-only">{title}</DialogDescription>
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
                    <SheetDescription className="sr-only">{title}</SheetDescription>
                </SheetHeader>
                {children}
            </SheetContent>
        </Sheet>
    );
}
