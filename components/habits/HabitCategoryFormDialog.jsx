'use client';

import { useId } from 'react';
import { useColorNameForm } from '@/hooks/useColorNameForm';
import ModalShell from '@/components/custom/ModalShell';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/custom/Loader';
import ColorNameField from '@/components/custom/ColorNameField';
import { HABIT_CATEGORY_NAME_MAX } from '@/modules/habits/habit-limits';
import {
    createHabitCategory,
    updateHabitCategory,
} from '@/modules/habits/actions/habit-category-actions';

/**
 * Modal for creating or editing a habit category, rendered through the shared ModalShell.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open.
 * @param {() => void} props.onClose - Called when the dialog should close.
 * @param {object|null} [props.category] - Category to edit, or null for create mode.
 */
export default function HabitCategoryFormDialog({ open, onClose, category = null }) {
    const formId = useId();
    const { isEditing, name, setName, color, setColor, submitting, error, handleSubmit } =
        useColorNameForm({
            open,
            entity: category,
            create: createHabitCategory,
            update: updateHabitCategory,
            invalidateQueryKey: ['habit-categories'],
            createdRowDefaults: {},
            onClose,
        });

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={submitting}
            title={isEditing ? 'Edit category' : 'New category'}
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form={formId}
                        disabled={!name.trim() || submitting}
                        className="gap-1.5"
                    >
                        {submitting && <Loader size="xs" />}
                        {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create category'}
                    </Button>
                </>
            }
        >
            <form id={formId} onSubmit={handleSubmit} className="space-y-4 mt-2">
                <ColorNameField
                    label="Category name"
                    name={name}
                    onNameChange={setName}
                    color={color}
                    onColorChange={setColor}
                    maxLength={HABIT_CATEGORY_NAME_MAX}
                    error={error}
                    disabled={submitting}
                />
            </form>
        </ModalShell>
    );
}
