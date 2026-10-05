'use server';

import { getNextPosition } from '@/lib/tasks/append-position';
import { readClientId, findOwnRowById, insertRowOnce } from '@/lib/idempotent-create';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { sanitizeString, checkMaxLength } from '@/lib/validation';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { resolveSpacePermission } from '@/lib/permissions/space-permissions';
import { SPACE_SETTINGS_OWNER_ONLY, SPACE_SUBTASK_CAP_INVALID } from '@/lib/error-codes';

/**
 * Creates a new space. Appends it after the last existing space.
 *
 * @param {object} fields
 * @param {string} [fields.id] - Optional client-made UUID; a retry with the same id returns the first try's row
 * @param {string} fields.name - Required space name
 * @param {string} [fields.color] - Hex color string, defaults to grey
 * @returns {{ data: object|null, error: string|null }}
 */
export const createSpace = withAuthenticatedAction(
    '[spaces] create',
    'Unexpected error creating space',
    async (user, supabase, fields) => {
        const clientId = readClientId(fields);
        if (clientId.failure) return { data: null, ...clientId.failure };
        const replayedSpace = await findOwnRowById(
            supabase,
            'spaces',
            clientId.id,
            'owner_id',
            user.id,
        );
        if (replayedSpace) return { data: replayedSpace, error: null };

        const name = sanitizeString(fields.name, true);
        if (!name) {
            return { data: null, error: 'Space name is required' };
        }
        const nameError = checkMaxLength(name, 100, 'Space name');
        if (nameError) return { data: null, error: nameError.error };

        const position = await getNextPosition(supabase, 'spaces', {});

        const { data: createdSpace, error } = await insertRowOnce(
            supabase,
            'spaces',
            {
                name,
                color: fields.color ?? '#6b7280',
                position,
                owner_id: user.id,
            },
            { clientId: clientId.id, ownerColumn: 'owner_id', userId: user.id },
        );

        if (error) {
            const guestLimitResult = toGuestLimitResult(error);
            if (guestLimitResult) return { data: null, ...guestLimitResult };
            return { data: null, error: 'Failed to create space' };
        }

        return { data: createdSpace, error: null };
    },
);

/**
 * Updates specific fields on a space (name, color, position, require_due_date, max_subtasks_per_parent).
 *
 * @param {string} id - Space ID to update
 * @param {object} fields - Partial space fields to update
 * @returns {{ data: object|null, error: string|null, code: string|undefined }}
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

        if ('max_subtasks_per_parent' in fields) {
            const maxSubtasksPerParent = fields.max_subtasks_per_parent;
            const isValid =
                maxSubtasksPerParent === null ||
                (Number.isInteger(maxSubtasksPerParent) && maxSubtasksPerParent > 0);
            if (!isValid) {
                return {
                    data: null,
                    error: 'The subtask limit must be a positive whole number',
                    code: SPACE_SUBTASK_CAP_INVALID,
                };
            }
        }

        // RLS already blocks this at the DB level - this just avoids a confusing silent no-op.
        if ('require_due_date' in fields || 'max_subtasks_per_parent' in fields) {
            const permissionLevel = await resolveSpacePermission(supabase, id, user.id);
            if (permissionLevel !== 'owner') {
                return {
                    data: null,
                    error: 'Only the space owner can change this setting',
                    code: SPACE_SETTINGS_OWNER_ONLY,
                };
            }
        }

        // Explicit allowlist, not { ...fields } - an unlisted field must never reach the update.
        const { name, color, position, require_due_date, max_subtasks_per_parent } = fields;
        const updates = {
            ...(name !== undefined && { name }),
            ...(color !== undefined && { color }),
            ...(position !== undefined && { position }),
            ...(typeof require_due_date === 'boolean' && { require_due_date }),
            ...(max_subtasks_per_parent !== undefined && { max_subtasks_per_parent }),
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
