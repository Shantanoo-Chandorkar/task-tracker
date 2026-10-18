'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDaysToLocalDate, localDateDiffInDays } from '@/modules/habits/domain/local-date';

/**
 * Plain prev/label/next control for moving one day at a time within a bounded date range.
 *
 * @param {object} props
 * @param {string} props.localDate - 'YYYY-MM-DD' currently shown.
 * @param {string} props.minLocalDate - Earliest selectable date (inclusive).
 * @param {string} props.maxLocalDate - Latest selectable date (inclusive).
 * @param {(localDate: string) => void} props.onChange - Called with the newly selected date.
 */
export default function DateStepper({ localDate, minLocalDate, maxLocalDate, onChange }) {
    const daysFromMax = localDateDiffInDays(maxLocalDate, localDate);
    const label = daysFromMax === 0 ? 'Today' : daysFromMax === 1 ? 'Yesterday' : localDate;
    // 'YYYY-MM-DD' strings sort lexically the same as chronologically - safe to compare directly.
    const isAtMin = localDate <= minLocalDate;
    const isAtMax = localDate >= maxLocalDate;

    return (
        <div className="flex items-center justify-center gap-3">
            <button
                type="button"
                aria-label="Previous day"
                disabled={isAtMin}
                onClick={() => onChange(addDaysToLocalDate(localDate, -1))}
                className="hit-area press-feedback rounded-full p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
                <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[8rem] text-center text-sm font-medium">{label}</span>
            <button
                type="button"
                aria-label="Next day"
                disabled={isAtMax}
                onClick={() => onChange(addDaysToLocalDate(localDate, 1))}
                className="hit-area press-feedback rounded-full p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
                <ChevronRight className="h-4 w-4" />
            </button>
        </div>
    );
}
