'use server';

import { createClient } from '@/lib/supabase/server';
import { getNextPosition } from '@/lib/position';
import { getCurrentUser } from '@/lib/auth/session';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { NOT_AUTHENTICATED } from '@/lib/error-codes';
import { sanitizeString, checkMaxLength } from '@/lib/validation';
import {
    resolveSpacePermission,
    getSpaceIdForList,
    blockCreateForPermission,
    blockWriteForPermission,
} from '@/lib/permissions/space-permissions';

/**
 * Creates a new sublist under a list. Appends it after the last existing sublist in that list.
 *
 * @param {object} fields
 * @param {string} fields.name - Required sublist name
 * @param {string} fields.list_id - Required parent list ID
 * @param {string} [fields.color] - Hex color string, defaults to grey
 * @returns {{ data: object|null, error: string|null }}
 */
export async function createSublist(fields) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'You must be logged in', code: NOT_AUTHENTICATED };

    const name = sanitizeString(fields.name, true);
    if (!name) {
        return { data: null, error: 'Sublist name is required' };
    }
    const nameError = checkMaxLength(name, 200, 'Sublist name');
    if (nameError) return { data: null, error: nameError.error };

    if (!fields.list_id) {
        return { data: null, error: 'A list is required' };
    }

    try {
        const supabase = await createClient();

        const spaceId = await getSpaceIdForList(supabase, fields.list_id);
        const permissionLevel = await resolveSpacePermission(supabase, spaceId, user.id);
        const permissionBlock = blockCreateForPermission(permissionLevel);
        if (permissionBlock) return { data: null, ...permissionBlock };

        const position = await getNextPosition(supabase, 'sublists', { list_id: fields.list_id });

        const { data: createdSublist, error } = await supabase
            .from('sublists')
            .insert({
                name,
                list_id: fields.list_id,
                color: fields.color ?? '#6b7280',
                position,
                created_by: user.id,
            })
            .select()
            .single();

        if (error) {
            const guestLimitResult = toGuestLimitResult(error);
            if (guestLimitResult) return { data: null, ...guestLimitResult };
            return { data: null, error: 'Failed to create sublist' };
        }

        return { data: createdSublist, error: null };
    } catch (thrown) {
        console.error('[sublists] create threw', { detail: thrown?.message });
        return { data: null, error: 'Unexpected error creating sublist' };
    }
}

/**
 * Updates specific fields on a sublist (name, color, position).
 *
 * @param {string} sublistId - Sublist ID to update
 * @param {object} fields - Partial sublist fields to update
 * @returns {{ data: object|null, error: string|null }}
 */
export async function updateSublist(sublistId, fields) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!sublistId) return { data: null, error: 'Sublist ID is required' };

    if ('name' in fields) {
        fields.name = sanitizeString(fields.name, true);
        if (!fields.name) return { data: null, error: 'Sublist name is required' };
        const nameError = checkMaxLength(fields.name, 200, 'Sublist name');
        if (nameError) return { data: null, error: nameError.error };
    }

    try {
        const supabase = await createClient();

        const { data: existingSublist } = await supabase
            .from('sublists')
            .select('created_by, lists(space_id)')
            .eq('id', sublistId)
            .maybeSingle();
        if (!existingSublist) return { data: null, error: 'Sublist not found' };

        const permissionLevel = await resolveSpacePermission(
            supabase,
            existingSublist.lists?.space_id,
            user.id,
        );
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: existingSublist.created_by === user.id,
        });
        if (permissionBlock) return { data: null, ...permissionBlock };

        const { name, color, position } = fields;
        const updates = {
            ...(name !== undefined && { name }),
            ...(color !== undefined && { color }),
            ...(position !== undefined && { position }),
        };

        const { data: updatedSublist, error } = await supabase
            .from('sublists')
            .update(updates)
            .eq('id', sublistId)
            .select()
            .maybeSingle();

        if (error || !updatedSublist) {
            return { data: null, error: 'Failed to update sublist' };
        }

        return { data: updatedSublist, error: null };
    } catch (thrown) {
        console.error('[sublists] update threw', { sublistId, detail: thrown?.message });
        return { data: null, error: 'Unexpected error updating sublist' };
    }
}

/**
 * Deletes a sublist, cascading to its tasks - callers should warn with the task count first.
 *
 * @param {string} sublistId - Sublist ID to delete
 * @returns {{ error: string|null }}
 */
export async function deleteSublist(sublistId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!sublistId) return { error: 'Sublist ID is required' };

    try {
        const supabase = await createClient();

        const { data: existingSublist } = await supabase
            .from('sublists')
            .select('created_by, lists(space_id)')
            .eq('id', sublistId)
            .maybeSingle();
        if (!existingSublist) return { error: 'Sublist not found' };

        const permissionLevel = await resolveSpacePermission(
            supabase,
            existingSublist.lists?.space_id,
            user.id,
        );
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: existingSublist.created_by === user.id,
        });
        if (permissionBlock) return permissionBlock;

        const { data: deletedSublist, error } = await supabase
            .from('sublists')
            .delete()
            .eq('id', sublistId)
            .select()
            .maybeSingle();

        if (error || !deletedSublist) {
            return { error: 'Sublist not found' };
        }

        return { error: null };
    } catch (thrown) {
        console.error('[sublists] delete threw', { sublistId, detail: thrown?.message });
        return { error: 'Unexpected error deleting sublist' };
    }
}
