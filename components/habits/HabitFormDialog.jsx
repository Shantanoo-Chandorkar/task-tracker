'use client';

import { useId, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useHabitCategoriesQuery } from '@/hooks/useHabitCategoriesQuery';
import { createHabit, updateHabit } from '@/modules/habits/actions/habit-actions';
import { UNIT_DIMENSIONS_BY_MEASURE_KIND } from '@/modules/habits/domain/habit-input';
import { MEASURE_KINDS } from '@/modules/habits/domain/measures/index';
import { UNIT_OPTIONS } from '@/modules/habits/domain/units';
import {
    DEFAULT_HABIT_COLOR,
    HABIT_DESCRIPTION_MAX,
    HABIT_TITLE_MAX,
} from '@/modules/habits/habit-limits';
import { withSavedRow } from '@/lib/cache/query-cache';
import { createClientId } from '@/lib/client-id';
import ModalShell from '@/components/custom/ModalShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CharLimitField from '@/components/custom/CharLimitField';
import ColorNameField from '@/components/custom/ColorNameField';
import FormError from '@/components/custom/FormError';
import LabeledField from '@/components/custom/LabeledField';
import { Loader } from '@/components/custom/Loader';
import EditorErrorBoundary from '@/components/custom/EditorErrorBoundary';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import HabitRecurrenceField from './HabitRecurrenceField';

// Tiptap is heavy and only needed once this dialog actually opens, same as TaskFormDialog.
const RichTextEditor = dynamic(() => import('@/components/custom/RichTextEditor'), {
    ssr: false,
    loading: () => (
        <div className="flex min-h-[150px] items-center justify-center">
            <Loader />
        </div>
    ),
});

const MEASURE_KIND_LABELS = {
    binary: 'Yes / no',
    count: 'A count (reps, glasses, pages...)',
    quantity: 'An amount with a unit (distance, weight, volume)',
    duration: 'A length of time',
};

const POLARITY_OPTIONS = [
    { value: 'build', label: 'Build this habit' },
    { value: 'quit', label: 'Quit this habit' },
];

/** @returns {string} 'YYYY-MM-DD' in the browser's own local time, as a UI default/max only. */
function getBrowserTodayLocalDate() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

/** @param {string} measureKind */
function unitOptionsForMeasureKind(measureKind) {
    const allowedDimensions = UNIT_DIMENSIONS_BY_MEASURE_KIND[measureKind];
    if (!allowedDimensions) return [];
    return UNIT_OPTIONS.filter((option) => allowedDimensions.includes(option.dimension));
}

/**
 * Modal for creating or editing a habit, via the shared ModalShell container.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open.
 * @param {() => void} props.onClose - Called when the dialog should close.
 * @param {object|null} [props.habit] - Habit to edit, or null for create mode.
 */
export default function HabitFormDialog({ open, onClose, habit = null }) {
    const formId = useId();
    const queryClient = useQueryClient();
    const todayLocalDate = getBrowserTodayLocalDate();
    const { data: categories = [] } = useHabitCategoriesQuery();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState(DEFAULT_HABIT_COLOR);
    const [categoryId, setCategoryId] = useState('');
    const [polarity, setPolarity] = useState('build');
    const [measureKind, setMeasureKind] = useState('binary');
    const [targetValue, setTargetValue] = useState('');
    const [unitCode, setUnitCode] = useState('');
    const [recurrence, setRecurrence] = useState({ kind: 'daily' });
    const [startedOn, setStartedOn] = useState(todayLocalDate);
    const [submitting, setSubmitting] = useState(false);
    const [titleError, setTitleError] = useState('');
    const [formError, setFormError] = useState('');
    const [createRequestId, setCreateRequestId] = useState(() => createClientId());

    const isEditing = Boolean(habit);
    const resetKey = open ? (habit?.id ?? 'create') : null;
    const [lastResetKey, setLastResetKey] = useState(null);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (open) {
            setTitle(habit?.title ?? '');
            setDescription(habit?.description ?? '');
            setColor(habit?.color ?? DEFAULT_HABIT_COLOR);
            setCategoryId(habit?.category_id ?? '');
            setPolarity(habit?.polarity ?? 'build');
            setMeasureKind(habit?.measure_kind ?? 'binary');
            setTargetValue(habit?.target_value ?? '');
            setUnitCode(habit?.unit_code ?? '');
            setRecurrence(habit?.recurrence ?? { kind: 'daily' });
            setStartedOn(habit?.started_on ?? todayLocalDate);
            setTitleError('');
            setFormError('');
            setSubmitting(false);
            setCreateRequestId(createClientId());
        }
    }

    function handleMeasureKindChange(nextMeasureKind) {
        setMeasureKind(nextMeasureKind);
        setTargetValue('');
        setUnitCode('');
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (submitting) return;

        if (!title.trim()) {
            setTitleError('Title is required');
            return;
        }

        setFormError('');
        setSubmitting(true);

        const fields = {
            title: title.trim(),
            description: description.trim() || null,
            color,
            category_id: categoryId || null,
            polarity,
            measure_kind: measureKind,
            target_value: measureKind === 'binary' ? undefined : Number(targetValue),
            unit_code: unitCode || undefined,
            recurrence,
            started_on: startedOn,
            ...(isEditing ? {} : { ...(createRequestId && { id: createRequestId }) }),
        };

        try {
            const { data: savedHabit, error } = isEditing
                ? await updateHabit(habit.id, fields)
                : await createHabit(fields);

            if (error) {
                setFormError(error);
                toast.error(isEditing ? 'Failed to update habit' : 'Failed to create habit');
                setSubmitting(false);
                return;
            }

            toast.success(isEditing ? 'Habit updated' : 'Habit created');
            // No unlock on success: the dialog stays on screen while it animates out.
            onClose();
            if (savedHabit) {
                queryClient.setQueryData(['habits'], (cachedHabits) =>
                    withSavedRow(cachedHabits, savedHabit, isEditing, {}),
                );
            }
            queryClient.invalidateQueries({ queryKey: ['habits'] });
        } catch {
            const message = 'Could not save. Check your connection and try again.';
            setFormError(message);
            toast.error(message);
            setSubmitting(false);
        }
    }

    const unitOptions = unitOptionsForMeasureKind(measureKind);

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={submitting}
            title={isEditing ? 'Edit habit' : 'New habit'}
            contentClassName="sm:max-w-xl"
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="submit" form={formId} disabled={submitting} className="gap-1.5">
                        {submitting && <Loader size="xs" />}
                        {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create habit'}
                    </Button>
                </>
            }
        >
            <form
                id={formId}
                onSubmit={handleSubmit}
                inert={submitting}
                className="space-y-4 mt-2 min-w-0"
            >
                <ColorNameField
                    label="Habit title"
                    name={title}
                    onNameChange={(value) => {
                        setTitle(value);
                        setTitleError('');
                    }}
                    color={color}
                    onColorChange={setColor}
                    maxLength={HABIT_TITLE_MAX}
                    error={titleError}
                    disabled={submitting}
                />

                <CharLimitField
                    label="Description (optional)"
                    currentLength={description.length}
                    maxLength={HABIT_DESCRIPTION_MAX}
                >
                    {() => (
                        <EditorErrorBoundary
                            value={description}
                            onChange={setDescription}
                            maxLength={HABIT_DESCRIPTION_MAX}
                            placeholder="Description (optional)"
                        >
                            <RichTextEditor
                                value={description}
                                onChange={setDescription}
                                maxLength={HABIT_DESCRIPTION_MAX}
                                placeholder="Description (optional)"
                                ariaLabel="Description"
                            />
                        </EditorErrorBoundary>
                    )}
                </CharLimitField>

                <div className="grid grid-cols-2 gap-4">
                    <LabeledField label="Category">
                        {({ controlId }) => (
                            <Select
                                value={categoryId || 'none'}
                                onValueChange={(value) =>
                                    setCategoryId(value === 'none' ? '' : value)
                                }
                                disabled={submitting}
                            >
                                <SelectTrigger id={controlId}>
                                    <SelectValue placeholder="No category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No category</SelectItem>
                                    {categories.map((category) => (
                                        <SelectItem key={category.id} value={category.id}>
                                            <span className="flex items-center gap-2">
                                                <span
                                                    className="h-2 w-2 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: category.color }}
                                                />
                                                {category.name}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </LabeledField>

                    <LabeledField label="Direction">
                        {({ controlId }) => (
                            <Select
                                value={polarity}
                                onValueChange={setPolarity}
                                disabled={submitting}
                            >
                                <SelectTrigger id={controlId}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {POLARITY_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </LabeledField>
                </div>

                <LabeledField label="What are you tracking?">
                    {({ controlId }) => (
                        <Select
                            value={measureKind}
                            onValueChange={handleMeasureKindChange}
                            disabled={submitting}
                        >
                            <SelectTrigger id={controlId}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {MEASURE_KINDS.map((kind) => (
                                    <SelectItem key={kind} value={kind}>
                                        {MEASURE_KIND_LABELS[kind]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </LabeledField>

                {measureKind !== 'binary' && (
                    <div className="grid grid-cols-2 gap-4">
                        <LabeledField label="Daily target">
                            {({ controlId }) => (
                                <Input
                                    id={controlId}
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={targetValue}
                                    disabled={submitting}
                                    onChange={(event) => setTargetValue(event.target.value)}
                                />
                            )}
                        </LabeledField>

                        {unitOptions.length > 0 && (
                            <LabeledField
                                label={measureKind === 'duration' ? 'Unit (optional)' : 'Unit'}
                            >
                                {({ controlId }) => (
                                    <Select
                                        value={unitCode || 'none'}
                                        onValueChange={(value) =>
                                            setUnitCode(value === 'none' ? '' : value)
                                        }
                                        disabled={submitting}
                                    >
                                        <SelectTrigger id={controlId}>
                                            <SelectValue placeholder="Choose a unit" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {measureKind === 'duration' && (
                                                <SelectItem value="none">No unit</SelectItem>
                                            )}
                                            {unitOptions.map((option) => (
                                                <SelectItem key={option.code} value={option.code}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </LabeledField>
                        )}
                    </div>
                )}

                <LabeledField label="Repeats">
                    {() => (
                        <HabitRecurrenceField
                            recurrence={recurrence}
                            onChange={setRecurrence}
                            todayLocalDate={todayLocalDate}
                            disabled={submitting}
                        />
                    )}
                </LabeledField>

                <LabeledField label="Start date">
                    {({ controlId }) => (
                        <Input
                            id={controlId}
                            type="date"
                            value={startedOn}
                            max={todayLocalDate}
                            disabled={submitting}
                            onChange={(event) => setStartedOn(event.target.value)}
                        />
                    )}
                </LabeledField>

                <FormError>{formError}</FormError>
            </form>
        </ModalShell>
    );
}
