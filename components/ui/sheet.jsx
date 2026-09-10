'use client';

import * as React from 'react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { cva } from 'class-variance-authority';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function Sheet({ ...props }) {
    return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }) {
    return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }) {
    return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }) {
    return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }) {
    return (
        <SheetPrimitive.Overlay
            data-slot="sheet-overlay"
            className={cn(
                'fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
                className,
            )}
            {...props}
        />
    );
}

const sheetContentVariants = cva(
    'fixed z-50 flex flex-col gap-4 bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none data-open:animate-in data-closed:animate-out',
    {
        variants: {
            side: {
                right: 'inset-y-0 right-0 h-full w-3/4 border-l border-border data-open:slide-in-from-right data-closed:slide-out-to-right sm:max-w-sm',
                left: 'inset-y-0 left-0 h-full w-3/4 border-r border-border data-open:slide-in-from-left data-closed:slide-out-to-left sm:max-w-sm',
                top: 'inset-x-0 top-0 h-auto border-b border-border data-open:slide-in-from-top data-closed:slide-out-to-top',
                bottom: 'inset-x-0 bottom-0 h-auto rounded-t-xl border-t border-border data-open:slide-in-from-bottom data-closed:slide-out-to-bottom',
            },
        },
        defaultVariants: { side: 'right' },
    },
);

function SheetContent({ className, children, side = 'right', showCloseButton = true, ...props }) {
    return (
        <SheetPortal>
            <SheetOverlay />
            <SheetPrimitive.Content
                data-slot="sheet-content"
                className={cn(sheetContentVariants({ side }), className)}
                {...props}
            >
                {children}
                {showCloseButton && (
                    <SheetPrimitive.Close
                        data-slot="sheet-close"
                        className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground opacity-70 hover:bg-muted hover:opacity-100 disabled:pointer-events-none"
                    >
                        <XIcon className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </SheetPrimitive.Close>
                )}
            </SheetPrimitive.Content>
        </SheetPortal>
    );
}

function SheetHeader({ className, ...props }) {
    return (
        <div data-slot="sheet-header" className={cn('flex flex-col gap-1.5 p-4', className)} {...props} />
    );
}

function SheetFooter({ className, ...props }) {
    return (
        <div
            data-slot="sheet-footer"
            className={cn('mt-auto flex flex-col gap-2 p-4', className)}
            {...props}
        />
    );
}

function SheetTitle({ className, ...props }) {
    return (
        <SheetPrimitive.Title
            data-slot="sheet-title"
            className={cn('font-heading text-base font-medium text-foreground', className)}
            {...props}
        />
    );
}

function SheetDescription({ className, ...props }) {
    return (
        <SheetPrimitive.Description
            data-slot="sheet-description"
            className={cn('text-sm text-muted-foreground', className)}
            {...props}
        />
    );
}

export {
    Sheet,
    SheetTrigger,
    SheetClose,
    SheetContent,
    SheetHeader,
    SheetFooter,
    SheetTitle,
    SheetDescription,
};
