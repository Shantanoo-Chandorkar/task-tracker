'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Shared name/color create-or-edit form state for the near-identical Space/List/Sublist/Status dialogs.
 *
 * @param {object} config
 * @param {boolean} config.open - Whether the dialog is open
 * @param {object|null} config.entity - The row being edited, or null for create mode
 * @param {Function} [config.onReset] - Called with (entity) on reset, so callers can reset their own extra fields
 * @param {Function} [config.isValid] - () => boolean, extra submit guard beyond name being non-empty
 * @param {Function} config.create - async (fields) => { error } — called in create mode
 * @param {Function} config.update - async (id, fields) => { error } — called in edit mode
 * @param {Function} [config.buildFields] - () => object, extra fields merged in on submit
 * @param {string[]} config.invalidateQueryKey - Query key to invalidate on success
 * @param {Function} config.onClose - Called after a successful submit
 * @returns {{
 *   isEditing: boolean,
 *   name: string, setName: Function,
 *   color: string, setColor: Function,
 *   submitting: boolean, error: string,
 *   handleSubmit: (event: Event) => Promise<void>,
 * }}
 */
export function useColorNameForm({
    open,
    entity,
    onReset,
    isValid = () => true,
    create,
    update,
    buildFields = () => ({}),
    invalidateQueryKey,
    onClose,
}) {
    const queryClient = useQueryClient();
    const isEditing = Boolean(entity);

    const [name, setName] = useState('');
    const [color, setColor] = useState('#6b7280');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const resetKey = open ? (entity?.id ?? 'create') : null;
    const [lastResetKey, setLastResetKey] = useState(resetKey);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (open) {
            setName(entity?.name ?? '');
            setColor(entity?.color ?? '#6b7280');
            setError('');
            onReset?.(entity);
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (!name.trim() || !isValid()) return;

        const fields = { name: name.trim(), color, ...buildFields() };

        setSubmitting(true);
        const { error } = isEditing ? await update(entity.id, fields) : await create(fields);
        setSubmitting(false);

        if (error) {
            setError(error);
            return;
        }

        await queryClient.invalidateQueries({ queryKey: invalidateQueryKey });
        onClose();
    }

    return { isEditing, name, setName, color, setColor, submitting, error, handleSubmit };
}
