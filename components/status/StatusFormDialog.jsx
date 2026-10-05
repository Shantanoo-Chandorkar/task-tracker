'use client';

import { useId } from 'react';
import { useColorNameForm } from '@/hooks/useColorNameForm';
import ModalShell from '@/components/custom/ModalShell';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/custom/Loader';
import ColorNameField from '@/components/custom/ColorNameField';
import { createStatus, updateStatus } from '@/actions/status-actions';

const STATUS_NAME_MAX = 50;

/**
 * Modal for creating or editing a Status, rendered through the shared ModalShell container.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Called when the dialog should close
 * @param {object|null} [props.status] - Status to edit, or null for create mode
 * @param {string} props.spaceId - Space this status belongs to (create mode only)
 */
export default function StatusFormDialog({ open, onClose, status = null, spaceId }) {
    const formId = useId();
    const { isEditing, name, setName, color, setColor, submitting, error, handleSubmit } =
        useColorNameForm({
            open,
            entity: status,
            create: createStatus,
            update: updateStatus,
            buildFields: () => ({ space_id: spaceId }),
            invalidateQueryKey: ['statuses', spaceId],
            createdRowDefaults: {},
            bustCache: () => ({ prefixes: ['/lists/'] }),
            onClose,
        });

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={submitting}
            title={isEditing ? 'Edit Status' : 'New Status'}
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
                        {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create status'}
                    </Button>
                </>
            }
        >
            <form id={formId} onSubmit={handleSubmit} className="space-y-4 mt-2">
                <ColorNameField
                    label="Status name"
                    name={name}
                    onNameChange={setName}
                    color={color}
                    onColorChange={setColor}
                    maxLength={STATUS_NAME_MAX}
                    error={error}
                    disabled={submitting}
                />
            </form>
        </ModalShell>
    );
}
