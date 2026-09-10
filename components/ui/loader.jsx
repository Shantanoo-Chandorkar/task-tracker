import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const sizeClasses = {
    xs: 'h-3 w-3',
    sm: 'h-3.5 w-3.5',
    default: 'h-4 w-4',
    lg: 'h-5 w-5',
};

/**
 * Reusable spinner for in-progress async actions (status change, save,
 * delete, drag-reorder persist, ...). Swap in place of an icon/label while a
 * request is pending so slow networks read as "working", not "broken".
 *
 * @param {object} props
 * @param {'xs'|'sm'|'default'|'lg'} [props.size] - Spinner size
 * @param {string} [props.className] - Additional classes
 */
export function Loader({ size = 'default', className }) {
    return (
        <LoaderCircle
            role="status"
            aria-label="Loading"
            className={cn('animate-spin text-current', sizeClasses[size], className)}
        />
    );
}
