'use server';

import { getNextPosition } from '@/lib/position';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { sanitizeString, checkMaxLength } from '@/lib/validation';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';

/**
 * Creates a new space. Appends it after the last existing space.
 *
 * @param {object} fields
 * @param {string} fields.name - Required space name
 * @param {string} [fields.color] - Hex color string, defaults to grey
 * @returns {{ data: object|null, error: string|null }}
 */
export const createSpace = withAuthenticatedAction(
    '[spaces] create',
    'Unexpected error creating space',
    async (user, supabase, fields) => {
        const name = sanitizeString(fields.name, true);
        if (!name) {
            return { data: null, error: 'Space name is required' };
        }
        const nameError = checkMaxLength(name, 100, 'Space name');
        if (nameError) return { data: null, error: nameError.error };

        const position = await getNextPosition(supabase, 'spaces', {});

        const { data: createdSpace, error } = await supabase
            .from('spaces')
            .insert({
                name,
                color: fields.color ?? '#6b7280',
                position,
                owner_id: user.id,
            })
            .select()
            .single();

        if (error) {
            const guestLimitResult = toGuestLimitResult(error);
            if (guestLimitResult) return { data: null, ...guestLimitResult };
            return { data: null, error: 'Failed to create space' };
        }

        return { data: createdSpace, error: null };
    },
);

/**
 * Updates specific fields on a space (name, color, position).
 *
 * @param {string} id - Space ID to update
 * @param {object} fields - Partial space fields to update
 * @returns {{ data: object|null, error: string|null }}
 */
export const updateSpace = withAuthenticatedAction(
    '[spaces] update',
    'Unexpected error updating space',
    async (user, supabase, id, fields) => {
        if (!id) return { data: null, error: 'Space ID is required' };

        if ('name' in fields) {
            fields.name = sanitizeString(fields.name, true);
            if (!fields.name) return { data: null, error: 'Space name is required' };
            const nameError = checkMaxLength(fields.name, 100, 'Space name');
            if (nameError) return { data: null, error: nameError.error };
        }

        // Explicit allowlist, not { ...fields } - an unlisted field must never reach the update.
        const { name, color, position } = fields;
        const updates = {
            ...(name !== undefined && { name }),
            ...(color !== undefined && { color }),
            ...(position !== undefined && { position }),
        };

        const { data: updatedSpace, error } = await supabase
            .from('spaces')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return { data: null, error: 'Failed to update space' };
        }

        return { data: updatedSpace, error: null };
    },
);

/**
 * Deletes a space. Cascades to its lists and their tasks (ON DELETE CASCADE).
 *
 * @param {string} id - Space ID to delete
 * @returns {{ error: string|null }}
 */
export const deleteSpace = withAuthenticatedAction(
    '[spaces] delete',
    'Unexpected error deleting space',
    async (user, supabase, id) => {
        if (!id) return { error: 'Space ID is required' };

        const { error } = await supabase.from('spaces').delete().eq('id', id);

        if (error) {
            return { error: 'Failed to delete space' };
        }

        return { error: null };
    },
    { hasData: false },
);
