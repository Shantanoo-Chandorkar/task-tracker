'use client';

import { useEffect, useRef } from 'react';
import { localDateRange, formatLocalDateForPill } from '@/modules/habits/domain/local-date';
import { cn } from '@/lib/ui/class-names';

/**
 * Horizontally scrollable strip of day pills - replaces repeated prev/next taps across a wide range.
 * Tapping a pill only selects the day; the caller decides what to do with the selection.
 *
 * @param {object} props
 * @param {string} props.localDate - Currently selected 'YYYY-MM-DD'.
 * @param {string} props.minLocalDate - Earliest selectable date (inclusive).
 * @param {string} props.maxLocalDate - Latest selectable date (inclusive).
 * @param {Set<string>} props.loggedLocalDates - Dates that already have a logged entry.
 * @param {Set<string>} [props.draftLocalDates] - Dates with a pending, unsaved edit.
 * @param {(localDate: string) => void} props.onChange - Called with the newly selected date.
 */
export default function DatePillStrip({
    localDate,
    minLocalDate,
    maxLocalDate,
    loggedLocalDates,
    draftLocalDates = new Set(),
    onChange,
}) {
    const dates = localDateRange(minLocalDate, maxLocalDate);
    const selectedPillRef = useRef(null);

    useEffect(() => {
        selectedPillRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }, [localDate]);

    return (
        <div
            className="-mx-1 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1 pb-1"
            role="group"
            aria-label="Pick a day"
        >
            {dates.map((date) => {
                const isSelected = date === localDate;
                const isLogged = loggedLocalDates.has(date);
                const hasDraft = draftLocalDates.has(date);
                const { weekday, day, month, full } = formatLocalDateForPill(date);
                return (
                    <button
                        key={date}
                        ref={isSelected ? selectedPillRef : undefined}
                        type="button"
                        onClick={() => onChange(date)}
                        aria-pressed={isSelected}
                        aria-label={hasDraft ? `${full} (unsaved)` : full}
                        className={cn(
                            'hit-area press-feedback flex min-w-[3.25rem] flex-shrink-0 snap-center flex-col items-center justify-center gap-0.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium motion-safe:transition-colors',
                            isSelected
                                ? 'border-foreground bg-foreground text-background'
                                : hasDraft
                                  ? 'border-primary bg-primary/10 text-foreground'
                                  : isLogged
                                    ? 'border-metric/60 bg-metric/10 text-foreground'
                                    : 'border-field text-muted-foreground hover:border-foreground hover:text-foreground',
                        )}
                    >
                        <span className="uppercase">{weekday}</span>
                        <span className="text-sm font-semibold">
                            {month} {day}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
