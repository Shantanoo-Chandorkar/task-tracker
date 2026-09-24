'use server';

import { getNextPosition } from '@/lib/position';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { sanitizeString, checkMaxLength } from '@/lib/validation';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import {
    resolveSpacePermission,
    blockCreateForPermission,
    blockWriteForPermission,
} from '@/lib/permissions/space-permissions';

/**
 * Creates a new list under a space. Appends it after the last existing list
 * in that space.
 *
 * @param {object} fields
 * @param {string} fields.name - Required list name
 * @param {string} fields.space_id - Required parent space ID
 * @param {string} [fields.color] - Hex color string, defaults to grey
 * @returns {{ data: object|null, error: string|null }}
 */
export const createList = withAuthenticatedAction(
    '[lists] create',
    'Unexpected error creating list',
    async (user, supabase, fields) => {
        const name = sanitizeString(fields.name, true);
        if (!name) {
            return { data: null, error: 'List name is required' };
        }
        const nameError = checkMaxLength(name, 200, 'List name');
        if (nameError) return { data: null, error: nameError.error };

        if (!fields.space_id) {
            return { data: null, error: 'A space is required' };
        }

        const permissionLevel = await resolveSpacePermission(supabase, fields.space_id, user.id);
        const permissionBlock = blockCreateForPermission(permissionLevel);
        if (permissionBlock) return { data: null, ...permissionBlock };

        const position = await getNextPosition(supabase, 'lists', { space_id: fields.space_id });

        const { data: createdList, error } = await supabase
            .from('lists')
            .insert({
                name,
                space_id: fields.space_id,
                color: fields.color ?? '#6b7280',
                position,
                created_by: user.id,
            })
            .select()
            .single();

        if (error) {
            const guestLimitResult = toGuestLimitResult(error);
            if (guestLimitResult) return { data: null, ...guestLimitResult };
            return { data: null, error: 'Failed to create list' };
        }

        return { data: createdList, error: null };
    },
);

/**
 * Updates specific fields on a list (name, color, position).
 *
 * @param {string} id - List ID to update
 * @param {object} fields - Partial list fields to update
 * @returns {{ data: object|null, error: string|null }}
 */
export const updateList = withAuthenticatedAction(
    '[lists] update',
    'Unexpected error updating list',
    async (user, supabase, id, fields) => {
        if (!id) return { data: null, error: 'List ID is required' };

        if ('name' in fields) {
            fields.name = sanitizeString(fields.name, true);
            if (!fields.name) return { data: null, error: 'List name is required' };
            const nameError = checkMaxLength(fields.name, 200, 'List name');
            if (nameError) return { data: null, error: nameError.error };
        }

        const { data: existingList } = await supabase
            .from('lists')
            .select('space_id, created_by')
            .eq('id', id)
            .maybeSingle();
        if (!existingList) return { data: null, error: 'List not found' };

        const permissionLevel = await resolveSpacePermission(
            supabase,
            existingList.space_id,
            user.id,
        );
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: existingList.created_by === user.id,
        });
        if (permissionBlock) return { data: null, ...permissionBlock };

        // Explicit allowlist, not { ...fields } - an unlisted field must never reach the update.
        const { name, color, position } = fields;
        const updates = {
            ...(name !== undefined && { name }),
            ...(color !== undefined && { color }),
            ...(position !== undefined && { position }),
        };

        const { data: updatedList, error } = await supabase
            .from('lists')
            .update(updates)
            .eq('id', id)
            .select()
            .maybeSingle();

        if (error || !updatedList) {
            return { data: null, error: 'Failed to update list' };
        }

        return { data: updatedList, error: null };
    },
);

/**
 * Deletes a list. Cascades to its tasks (ON DELETE CASCADE) - callers are
 * expected to warn the user with the task count before calling this.
 *
 * @param {string} id - List ID to delete
 * @returns {{ error: string|null }}
 */
export const deleteList = withAuthenticatedAction(
    '[lists] delete',
    'Unexpected error deleting list',
    async (user, supabase, id) => {
        if (!id) return { error: 'List ID is required' };

        const { data: existingList } = await supabase
            .from('lists')
            .select('space_id, created_by')
            .eq('id', id)
            .maybeSingle();
        if (!existingList) return { error: 'List not found' };

        const permissionLevel = await resolveSpacePermission(
            supabase,
            existingList.space_id,
            user.id,
        );
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: existingList.created_by === user.id,
        });
        if (permissionBlock) return permissionBlock;

        const { data: deletedList, error } = await supabase
            .from('lists')
            .delete()
            .eq('id', id)
            .select()
            .maybeSingle();

        if (error || !deletedList) {
            return { error: 'List not found' };
        }

        return { error: null };
    },
    { hasData: false },
);
