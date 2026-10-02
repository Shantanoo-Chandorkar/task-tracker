'use client';

import { useId } from 'react';
import FormError from '@/components/ui/FormError';

/**
 * Wraps any input with a label, live character counter and inline error, so every capped field looks the same.
 *
 * @param {object} props
 * @param {string} props.label - Visible label text.
 * @param {number} props.currentLength - Current character count.
 * @param {number} props.maxLength - Maximum allowed characters.
 * @param {string} [props.error] - Server/action error shown below the input.
 * @param {(control: { id: string, 'aria-invalid'?: boolean, 'aria-describedby'?: string }) => import('react').ReactNode}
 *   props.children - Renders the input; spread the received props onto it so label and error are tied to it.
 */
export default function CharLimitField({ label, currentLength, maxLength, error, children }) {
    const controlId = useId();
    const errorId = useId();
    const isExceeded = currentLength >= maxLength;
    const visibleError = error || (isExceeded ? 'Character limit exceeded' : null);

    return (
        <div className="space-y-1 min-w-0">
            <div className="flex items-center justify-between">
                <label htmlFor={controlId} className="text-sm font-medium text-foreground">
                    {label}
                </label>
                {/* The limit message below is what screen readers get; the live count would be noise */}
                <span
                    aria-hidden="true"
                    className={`text-xs ${isExceeded ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
                >
                    {currentLength}/{maxLength}
                </span>
            </div>
            {children({
                id: controlId,
                'aria-invalid': visibleError ? true : undefined,
                'aria-describedby': visibleError ? errorId : undefined,
            })}
            <FormError errorId={errorId}>{visibleError}</FormError>
        </div>
    );
}
