'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { withSavedRow } from '@/lib/cache/query-cache';
import { createClientId } from '@/lib/client-id';

/**
 * Create-or-edit form state for the timer template dialog. Not built on `useColorNameForm` -
 * a template is name + blocks, not name + color, and forcing both through one hook would grow
 * conditionals for two different field shapes (same DRY-vs-coupling call as habit categories).
 *
 * @param {object} config
 * @param {boolean} config.open - Whether the dialog is open.
 * @param {object|null} config.template - The template being edited, or null for create mode.
 * @param {Function} config.create - async (fields) => { data, error } - called in create mode.
 * @param {Function} config.update - async (id, fields) => { data, error } - called in edit mode.
 * @param {() => void} config.onClose - Called after a successful submit.
 * @returns {{
 *   isEditing: boolean,
 *   name: string, setName: Function,
 *   blocks: object[], setBlocks: Function,
 *   submitting: boolean, error: string,
 *   handleSubmit: (event: Event) => Promise<void>,
 * }}
 */
export function useTimerTemplateForm({ open, template, create, update, onClose }) {
    const queryClient = useQueryClient();
    // Parents clear `template` the moment they close, while the dialog is still fading out, so mode is fixed at open.
    const [openedTemplate, setOpenedTemplate] = useState(template);
    const isEditing = Boolean(openedTemplate);

    // Made when the dialog opens and kept for retries, so a retry after a lost reply cannot create a second row
    const [createRequestId, setCreateRequestId] = useState(() => createClientId());
    const [name, setName] = useState('');
    const [blocks, setBlocks] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const resetKey = open ? (template?.id ?? 'create') : null;
    const [lastResetKey, setLastResetKey] = useState(resetKey);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (open) {
            setOpenedTemplate(template);
            setCreateRequestId(createClientId());
            setSubmitting(false);
            setName(template?.name ?? '');
            setBlocks(template?.blocks ?? []);
            setError('');
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (submitting || !name.trim() || blocks.length === 0) return;

        const fields = { name: name.trim(), blocks };

        setSubmitting(true);
        let submitResult;
        try {
            submitResult = isEditing
                ? await update(openedTemplate.id, fields)
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
            queryClient.setQueryData(['timer-templates'], (cachedRows) =>
                withSavedRow(cachedRows, savedRow, isEditing, {}),
            );
        }
        // Not awaited: the server already confirmed, so the dialog must not wait for a refetch round trip.
        queryClient.invalidateQueries({ queryKey: ['timer-templates'] });
        onClose();
    }

    return { isEditing, name, setName, blocks, setBlocks, submitting, error, handleSubmit };
}
