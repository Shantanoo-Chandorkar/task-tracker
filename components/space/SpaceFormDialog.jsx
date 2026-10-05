'use client';

import { useId } from 'react';
import { useColorNameForm } from '@/hooks/useColorNameForm';
import ModalShell from '@/components/custom/ModalShell';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/custom/Loader';
import ColorNameField from '@/components/custom/ColorNameField';
import { createSpace, updateSpace } from '@/actions/space-actions';

const SPACE_NAME_MAX = 100;

/**
 * Modal for creating or editing a Space, rendered through the shared ModalShell container.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Called when the dialog should close
 * @param {object|null} [props.space] - Space to edit, or null for create mode
 */
export default function SpaceFormDialog({ open, onClose, space = null }) {
    const formId = useId();
    const { isEditing, name, setName, color, setColor, submitting, error, handleSubmit } =
        useColorNameForm({
            open,
            entity: space,
            create: createSpace,
            update: updateSpace,
            invalidateQueryKey: ['spaces'],
            createdRowDefaults: { my_permission_level: 'owner' },
            bustCache: () => ({ urls: ['/spaces'], prefixes: ['/lists/'] }),
            onClose,
        });

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={submitting}
            title={isEditing ? 'Edit Space' : 'New Space'}
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
                        {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create space'}
                    </Button>
                </>
            }
        >
            <form id={formId} onSubmit={handleSubmit} className="space-y-4 mt-2">
                <ColorNameField
                    label="Space name"
                    name={name}
                    onNameChange={setName}
                    color={color}
                    onColorChange={setColor}
                    maxLength={SPACE_NAME_MAX}
                    error={error}
                    disabled={submitting}
                />
            </form>
        </ModalShell>
    );
}
