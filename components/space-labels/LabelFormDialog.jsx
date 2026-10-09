'use client';

import { useId } from 'react';
import { useColorNameForm } from '@/hooks/useColorNameForm';
import ModalShell from '@/components/custom/ModalShell';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/custom/Loader';
import ColorNameField from '@/components/custom/ColorNameField';
import { LABEL_NAME_MAX } from '@/lib/space-labels/label-limits';

/**
 * Modal for creating or editing a space label (a status or a tag), rendered through the shared ModalShell.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {() => void} props.onClose - Called when the dialog should close
 * @param {string} props.noun - Capitalised kind of label, e.g. 'Status' or 'Tag'
 * @param {object|null} [props.label] - Label to edit, or null for create mode
 * @param {string} props.spaceId - Space the label belongs to (create mode only)
 * @param {string} props.resourceKey - Cache key of the label list, e.g. 'statuses'
 * @param {(fields: object) => Promise<object>} props.create - Server action that creates a label
 * @param {(id: string, fields: object) => Promise<object>} props.update - Server action that updates a label
 */
export default function LabelFormDialog({
    open,
    onClose,
    noun,
    label = null,
    spaceId,
    resourceKey,
    create,
    update,
}) {
    const formId = useId();
    const { isEditing, name, setName, color, setColor, submitting, error, handleSubmit } =
        useColorNameForm({
            open,
            entity: label,
            create,
            update,
            buildFields: () => ({ space_id: spaceId }),
            invalidateQueryKey: [resourceKey, spaceId],
            createdRowDefaults: {},
            bustCache: () => ({ prefixes: ['/lists/'] }),
            onClose,
        });

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={submitting}
            title={isEditing ? `Edit ${noun}` : `New ${noun}`}
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
                        {submitting
                            ? 'Saving...'
                            : isEditing
                              ? 'Save changes'
                              : `Create ${noun.toLowerCase()}`}
                    </Button>
                </>
            }
        >
            <form id={formId} onSubmit={handleSubmit} className="space-y-4 mt-2">
                <ColorNameField
                    label={`${noun} name`}
                    name={name}
                    onNameChange={setName}
                    color={color}
                    onColorChange={setColor}
                    maxLength={LABEL_NAME_MAX}
                    error={error}
                    disabled={submitting}
                />
            </form>
        </ModalShell>
    );
}
