'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `value`, delayed until it has stopped changing for `delayMs`.
 *
 * @param {*} value - The fast-changing value to debounce
 * @param {number} delayMs - How long the value must be stable before the debounced copy updates
 * @returns {*} The debounced value
 */
export function useDebouncedValue(value, delayMs) {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timeoutId = setTimeout(() => setDebouncedValue(value), delayMs);
        return () => clearTimeout(timeoutId);
    }, [value, delayMs]);

    return debouncedValue;
}
