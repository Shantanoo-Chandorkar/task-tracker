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
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/hooks/useIsDesktop';

const FOOTER_CLASSES =
    '-mx-4 -mb-4 flex flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:justify-end';

function ModalFooter({ children, roundedBottom, className }) {
    if (!children) return null;
    return (
        <div className={cn(FOOTER_CLASSES, roundedBottom && 'rounded-b-xl', className)}>
            {children}
        </div>
    );
}

// Every modal requires an explicit Cancel/close click - an outside click must never dismiss it.
function blockOutsideDismiss(event) {
    event.preventDefault();
}

/**
 * Shared container for every modal in the app - unifies title/description/footer chrome across consumers.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the modal is open
 * @param {Function} props.onClose - Called when the modal should close
 * @param {string} props.title - Modal title
 * @param {string} [props.description] - Real, visible description; defaults to an sr-only copy of the title
 * @param {'form'|'alert'|'sheet'} [props.variant] - 'form' (default), 'alert', or 'sheet' - see branches below
 * @param {'top'|'bottom'|'left'|'right'} [props.side] - Sheet edge for variant 'sheet' only (default 'bottom')
 * @param {string} [props.contentClassName] - Extra classes for the Sheet's content panel (variant 'sheet' only)
 * @param {string} [props.headerClassName] - Extra classes for the Sheet's header (variant 'sheet' only)
 * @param {string} [props.titleClassName] - Extra classes for the title text (variant 'sheet' only)
 * @param {import('react').ReactNode} [props.footer] - Action buttons, rendered in the shared footer bar
 * @param {string} [props.footerClassName] - Extra classes for the footer bar (e.g. a stacked button layout)
 * @param {Function} [props.onCloseAutoFocus] - Override Radix's default post-close focus return (variant 'form')
 * @param {import('react').ReactNode} props.children - Modal body content
 */
export default function ModalShell({
    open,
    onClose,
    title,
    description,
    variant = 'form',
    side = 'bottom',
    contentClassName,
    headerClassName,
    titleClassName,
    footer,
    footerClassName,
    onCloseAutoFocus,
    children,
}) {
    const isDesktop = useIsDesktop();
    const handleOpenChange = (isOpen) => !isOpen && onClose();

    if (variant === 'alert') {
        return (
            <AlertDialog open={open} onOpenChange={handleOpenChange}>
                <AlertDialogContent onPointerDownOutside={blockOutsideDismiss}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{title}</AlertDialogTitle>
                        {description && (
                            <AlertDialogDescription>{description}</AlertDialogDescription>
                        )}
                    </AlertDialogHeader>
                    {children}
                    <ModalFooter roundedBottom className={footerClassName}>
                        {footer}
                    </ModalFooter>
                </AlertDialogContent>
            </AlertDialog>
        );
    }

    if (variant === 'sheet' || !isDesktop) {
        const isPureSheet = variant === 'sheet';
        return (
            <Sheet open={open} onOpenChange={handleOpenChange}>
                <SheetContent
                    side={isPureSheet ? side : 'bottom'}
                    className={
                        isPureSheet
                            ? contentClassName
                            : cn('max-h-[90vh] overflow-y-auto', contentClassName)
                    }
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onCloseAutoFocus={onCloseAutoFocus}
                    onPointerDownOutside={blockOutsideDismiss}
                >
                    <SheetHeader className={headerClassName}>
                        <SheetTitle className={titleClassName}>{title}</SheetTitle>
                        <SheetDescription className={description ? undefined : 'sr-only'}>
                            {description ?? title}
                        </SheetDescription>
                    </SheetHeader>
                    {children}
                    <ModalFooter className={footerClassName}>{footer}</ModalFooter>
                </SheetContent>
            </Sheet>
        );
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className="max-w-lg"
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={onCloseAutoFocus}
                onPointerDownOutside={blockOutsideDismiss}
            >
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className={description ? undefined : 'sr-only'}>
                        {description ?? title}
                    </DialogDescription>
                </DialogHeader>
                {children}
                <ModalFooter roundedBottom className={footerClassName}>
                    {footer}
                </ModalFooter>
            </DialogContent>
        </Dialog>
    );
}
