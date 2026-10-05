'use client';

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import ModalShell from '@/components/custom/ModalShell';
import { humanReadableLabel, recurrenceFrequencyLabel } from '@/lib/recurrence';

/**
 * Recurrence summary for a task row: a frequency pill that opens the full schedule on tap (no hover on mobile).
 *
 * @param {object} props
 * @param {object|null} [props.recurrenceRule] - Stored recurrence rule of the task
 */
export default function TaskRowRecurrence({ recurrenceRule }) {
    const [isOpen, setIsOpen] = useState(false);
    const frequencyLabel = recurrenceFrequencyLabel(recurrenceRule) || 'Recurring';
    const scheduleText = useMemo(() => humanReadableLabel(recurrenceRule), [recurrenceRule]);

    return (
        <>
            <button
                type="button"
                onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    setIsOpen(true);
                }}
                className="inline-flex flex-shrink-0 items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/25"
            >
                <RefreshCw className="h-2.5 w-2.5" />
                {frequencyLabel}
            </button>
            <ModalShell open={isOpen} onClose={() => setIsOpen(false)} title="Repeats">
                <p className="text-sm capitalize">
                    {scheduleText || 'No schedule details available.'}
                </p>
            </ModalShell>
        </>
    );
}
