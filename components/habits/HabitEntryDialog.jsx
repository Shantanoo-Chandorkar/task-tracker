'use client';

import { useState } from 'react';
import ModalShell from '@/components/custom/ModalShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/custom/Loader';
import FormError from '@/components/custom/FormError';
import { useHabitCheckIn } from '@/hooks/useHabitCheckIn';
import { useHabitEntryValue } from '@/hooks/useHabitEntryValue';
import { UNIT_OPTIONS } from '@/modules/habits/domain/units';
import { DEFAULT_BACKFILL_WINDOW_DAYS } from '@/modules/habits/domain/habit-input';
import { addDaysToLocalDate } from '@/modules/habits/domain/local-date';
import DatePillStrip from './DatePillStrip';

// Cosmetic default label for a unit-less duration habit - never affects the stored value.
const IMPLICIT_DURATION_UNIT_LABEL = 'min';

/** @param {object} habit */
function resolveUnitLabel(habit) {
    if (habit.measure_kind === 'count') return null;
    if (!habit.unit_code) {
        return habit.measure_kind === 'duration' ? IMPLICIT_DURATION_UNIT_LABEL : null;
    }
    const option = UNIT_OPTIONS.find((candidate) => candidate.code === habit.unit_code);
    return option ? option.label : habit.unit_code;
}

/**
 * Logs a count/quantity/duration amount, or toggles a binary habit, for today or a past day.
 * Shared by the row's check-in control (today only, non-binary) and the "Log a different day"
 * back-fill flow (any measure kind) - the body swaps by `habit.measure_kind`.
 *
 * In back-fill mode, every edit is kept as a local draft keyed by date and committed all at once
 * via Save; today-only mode is untouched and still saves immediately.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open.
 * @param {() => void} props.onClose - Called when the dialog should close.
 * @param {object} props.habit - The habit being logged.
 * @param {object[]} props.entries - This habit's own entries (any order), to find a day's existing one.
 * @param {string} props.todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 * @param {boolean} [props.allowDateNavigation] - Shows a day-picker strip and enables multi-day drafts.
 */
export default function HabitEntryDialog({
    open,
    onClose,
    habit,
    entries,
    todayLocalDate,
    allowDateNavigation = false,
}) {
    const { toggle } = useHabitCheckIn();
    const { setValue, setValues } = useHabitEntryValue();
    const [localDate, setLocalDate] = useState(todayLocalDate);
    const [draftValue, setDraftValue] = useState('');
    const [draftsByLocalDate, setDraftsByLocalDate] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [valueError, setValueError] = useState('');

    const resetKey = open ? habit.id : null;
    const [lastResetKey, setLastResetKey] = useState(null);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (open) {
            setLocalDate(todayLocalDate);
            const initialEntry =
                entries.find((entry) => entry.local_date === todayLocalDate) ?? null;
            setDraftValue(initialEntry ? String(initialEntry.value) : '');
            setDraftsByLocalDate({});
            setSubmitting(false);
            setValueError('');
        }
    }

    const existingEntry = entries.find((entry) => entry.local_date === localDate) ?? null;
    const isBinary = habit.measure_kind === 'binary';
    const isQuit = habit.polarity === 'quit';
    const unitLabel = resolveUnitLabel(habit);
    const loggedLocalDates = new Set(entries.map((entry) => entry.local_date));
    const draftLocalDates = new Set(Object.keys(draftsByLocalDate));
    const hasPendingDrafts = draftLocalDates.size > 0;
    const hasDraftForCurrentDate = allowDateNavigation && localDate in draftsByLocalDate;

    const isLoggedForDisplay = hasDraftForCurrentDate
        ? Boolean(draftsByLocalDate[localDate])
        : Boolean(existingEntry);
    const displayedValue = allowDateNavigation
        ? hasDraftForCurrentDate
            ? (draftsByLocalDate[localDate] ?? '')
            : existingEntry
              ? String(existingEntry.value)
              : ''
        : draftValue;
    const canClearCurrentDay = hasDraftForCurrentDate
        ? draftsByLocalDate[localDate] !== null
        : Boolean(existingEntry);

    // Wired only to DatePillStrip's onChange (back-fill mode) - every edit already lives in `draftsByLocalDate`.
    /** @param {string} nextLocalDate */
    function handleDateChange(nextLocalDate) {
        setLocalDate(nextLocalDate);
        setValueError('');
    }

    /** @param {string} value */
    function handleDraftValueChange(value) {
        if (allowDateNavigation) {
            setDraftsByLocalDate((previousDrafts) => ({ ...previousDrafts, [localDate]: value }));
        } else {
            setDraftValue(value);
        }
        setValueError('');
    }

    /** @param {number} delta */
    function adjustCount(delta) {
        handleDraftValueChange(String(Math.max(0, Number(displayedValue || 0) + delta)));
    }

    async function handleToggle() {
        if (allowDateNavigation) {
            setDraftsByLocalDate((previousDrafts) => ({
                ...previousDrafts,
                [localDate]: !isLoggedForDisplay,
            }));
            return;
        }
        setSubmitting(true);
        try {
            const didToggle = await toggle(habit, existingEntry, localDate);
            if (didToggle) onClose();
        } finally {
            setSubmitting(false);
        }
    }

    async function handleSaveAll() {
        const draftDates = Object.keys(draftsByLocalDate);
        if (!isBinary) {
            for (const draftLocalDate of draftDates) {
                const value = draftsByLocalDate[draftLocalDate];
                if (value === null) continue;
                if (value === '' || Number.isNaN(Number(value))) {
                    setLocalDate(draftLocalDate);
                    setValueError('Value cannot be empty');
                    return;
                }
            }
        }

        setSubmitting(true);
        try {
            const rawEntries = draftDates.map((draftLocalDate) => ({
                localDate: draftLocalDate,
                rawValue: draftsByLocalDate[draftLocalDate],
            }));
            const didSave = await setValues(habit, rawEntries);
            if (didSave) {
                setDraftsByLocalDate({});
                onClose();
            }
        } finally {
            setSubmitting(false);
        }
    }

    async function handleSave() {
        if (allowDateNavigation) {
            await handleSaveAll();
            return;
        }
        if (draftValue === '' || Number.isNaN(Number(draftValue))) {
            setValueError('Value cannot be empty');
            return;
        }
        setSubmitting(true);
        try {
            const didSave = await setValue(habit, existingEntry, localDate, draftValue);
            if (didSave) onClose();
        } finally {
            setSubmitting(false);
        }
    }

    async function handleClear() {
        if (allowDateNavigation) {
            setDraftsByLocalDate((previousDrafts) => ({ ...previousDrafts, [localDate]: null }));
            setValueError('');
            return;
        }
        setSubmitting(true);
        try {
            const didClear = await setValue(habit, existingEntry, localDate, null);
            if (didClear) onClose();
        } finally {
            setSubmitting(false);
        }
    }

    const showBinaryOnlyFooter = isBinary && !allowDateNavigation;

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={submitting}
            title={habit.title}
            footer={
                showBinaryOnlyFooter ? (
                    <Button type="button" variant="outline" onClick={onClose}>
                        Close
                    </Button>
                ) : (
                    <>
                        {!isBinary && canClearCurrentDay && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleClear}
                                disabled={submitting}
                            >
                                Clear
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={submitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSave}
                            disabled={submitting || (allowDateNavigation && !hasPendingDrafts)}
                            className="gap-1.5"
                        >
                            {submitting && <Loader size="xs" />}
                            Save
                        </Button>
                    </>
                )
            }
        >
            <div className="space-y-4 mt-2">
                {allowDateNavigation && (
                    <DatePillStrip
                        localDate={localDate}
                        minLocalDate={addDaysToLocalDate(
                            todayLocalDate,
                            -DEFAULT_BACKFILL_WINDOW_DAYS,
                        )}
                        maxLocalDate={todayLocalDate}
                        loggedLocalDates={loggedLocalDates}
                        draftLocalDates={draftLocalDates}
                        onChange={handleDateChange}
                    />
                )}

                {isBinary ? (
                    <div className="flex items-center justify-center py-2">
                        <button
                            type="button"
                            onClick={handleToggle}
                            disabled={submitting}
                            aria-pressed={isLoggedForDisplay}
                            className={`hit-area press-feedback flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-medium motion-safe:transition-colors disabled:opacity-60 ${
                                isLoggedForDisplay
                                    ? isQuit
                                        ? 'border-destructive bg-destructive text-destructive-foreground'
                                        : 'border-metric bg-metric text-background'
                                    : 'border-field text-muted-foreground hover:border-foreground hover:text-foreground'
                            }`}
                        >
                            {submitting && <Loader size="sm" />}
                            {isLoggedForDisplay
                                ? isQuit
                                    ? 'Slipped'
                                    : 'Done'
                                : isQuit
                                  ? 'On track'
                                  : 'Not done yet'}
                        </button>
                    </div>
                ) : habit.measure_kind === 'count' ? (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-center gap-4 py-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                disabled={submitting}
                                onClick={() => adjustCount(-1)}
                                aria-label="Decrease"
                            >
                                -
                            </Button>
                            <Input
                                type="number"
                                min={0}
                                step="any"
                                value={displayedValue}
                                disabled={submitting}
                                onChange={(event) => handleDraftValueChange(event.target.value)}
                                className="w-24 text-center"
                                aria-label="Value"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                disabled={submitting}
                                onClick={() => adjustCount(1)}
                                aria-label="Increase"
                            >
                                +
                            </Button>
                        </div>
                        <div className="text-center">
                            <FormError>{valueError}</FormError>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-center gap-2 py-2">
                            <Input
                                type="number"
                                min={0}
                                step="any"
                                value={displayedValue}
                                disabled={submitting}
                                onChange={(event) => handleDraftValueChange(event.target.value)}
                                className="w-28"
                                aria-label="Value"
                            />
                            {unitLabel && (
                                <span className="text-sm text-muted-foreground">{unitLabel}</span>
                            )}
                        </div>
                        <div className="text-center">
                            <FormError>{valueError}</FormError>
                        </div>
                    </div>
                )}
            </div>
        </ModalShell>
    );
}
