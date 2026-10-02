'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { bustPageCache } from '@/lib/service-worker-cache';
import { withSavedRow } from '@/lib/query-cache';
import { createClientId } from '@/lib/client-id';

/**
 * Shared name/color create-or-edit form state for the near-identical Space/List/Sublist/Status dialogs.
 *
 * @param {object} config
 * @param {boolean} config.open - Whether the dialog is open
 * @param {object|null} config.entity - The row being edited, or null for create mode
 * @param {Function} [config.onReset] - Called with (entity) on reset, so callers can reset their own extra fields
 * @param {Function} [config.isValid] - () => boolean, extra submit guard beyond name being non-empty
 * @param {Function} config.create - async (fields) => { error } - called in create mode
 * @param {Function} config.update - async (id, fields) => { error } - called in edit mode
 * @param {Function} [config.buildFields] - () => object, extra fields merged in on submit
 * @param {string[]} config.invalidateQueryKey - Query key whose cached rows are updated, then refetched later
 * @param {object} [config.createdRowDefaults] - Cache-only fields a new row needs (e.g. task_count); omit to skip
 * @param {Function} [config.bustCache] - () => {urls?, prefixes?} of pages to evict on success
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
    createdRowDefaults,
    bustCache,
    onClose,
}) {
    const queryClient = useQueryClient();
    // Parents clear `entity` the moment they close, while the dialog is still fading out, so mode is fixed at open.
    const [openedEntity, setOpenedEntity] = useState(entity);
    const isEditing = Boolean(openedEntity);

    // Made when the dialog opens and kept for retries, so a retry after a lost reply cannot create a second row
    const [createRequestId, setCreateRequestId] = useState(() => createClientId());
    const [name, setName] = useState('');
    const [color, setColor] = useState('#6b7280');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const resetKey = open ? (entity?.id ?? 'create') : null;
    const [lastResetKey, setLastResetKey] = useState(resetKey);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (open) {
            setOpenedEntity(entity);
            setCreateRequestId(createClientId());
            setSubmitting(false);
            setName(entity?.name ?? '');
            setColor(entity?.color ?? '#6b7280');
            setError('');
            onReset?.(entity);
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (submitting || !name.trim() || !isValid()) return;

        const fields = { name: name.trim(), color, ...buildFields() };

        setSubmitting(true);
        let submitResult;
        try {
            submitResult = isEditing
                ? await update(openedEntity.id, fields)
                : await create({ ...fields, ...(createRequestId && { id: createRequestId }) });
        } catch {
            setSubmitting(false);
            setError('Could not reach the server. Check your connection and try again.');
            return;
        }

        if (submitResult.error) {
            setSubmitting(false);
            setError(submitResult.error);
            return;
        }

        // No unlock on success: the dialog stays on screen while it animates out, and the next open resets the form.
        const savedRow = submitResult.data;
        if (savedRow) {
            queryClient.setQueryData(invalidateQueryKey, (cachedRows) =>
                withSavedRow(cachedRows, savedRow, isEditing, createdRowDefaults),
            );
        }
        // Not awaited: the server already confirmed, so the dialog must not wait for a refetch round trip.
        queryClient.invalidateQueries({ queryKey: invalidateQueryKey });
        if (bustCache) bustPageCache(bustCache());
        onClose();
    }

    return { isEditing, name, setName, color, setColor, submitting, error, handleSubmit };
}
