import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names, dropping falsy values and letting later Tailwind classes win over earlier ones.
 *
 * @param {...import('clsx').ClassValue} inputs - Class names, arrays or conditional objects
 * @returns {string} Merged class string
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
