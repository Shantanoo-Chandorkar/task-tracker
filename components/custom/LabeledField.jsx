'use client';

import { useId } from 'react';

/**
 * Small persistent label above a form control, so its purpose survives after a value is picked.
 *
 * @param {object} props
 * @param {string} props.label - Label text
 * @param {import('react').ReactNode | ((control: { controlId: string, labelId: string }) => import('react').ReactNode)}
 *   props.children - The field being labeled. A function receives the `controlId` for a single control, or the `labelId`
 *   for a group of controls that use `aria-labelledby`.
 */
export default function LabeledField({ label, children }) {
    const controlId = useId();
    const labelId = useId();

    return (
        <div className="space-y-1 flex flex-col gap-2">
            <label id={labelId} htmlFor={controlId} className="text-xs text-muted-foreground">
                {label}
            </label>
            {typeof children === 'function' ? children({ controlId, labelId }) : children}
        </div>
    );
}
