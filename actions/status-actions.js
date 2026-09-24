'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { getNextPosition } from '@/lib/position';
import { getCurrentUser } from '@/lib/auth/session';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { NOT_AUTHENTICATED } from '@/lib/error-codes';
import { sanitizeString, checkMaxLength } from '@/lib/validation';
import {
    resolveSpacePermission,
    blockCreateForPermission,
    blockWriteForPermission,
} from '@/lib/permissions/space-permissions';

/**
 * Creates a new status. Appends it after the last existing status in its space.
 *
 * @param {object} fields
 * @param {string} fields.name - Required status name
 * @param {string} fields.space_id - Required space this status belongs to
 * @param {string} [fields.color] - Hex color string, defaults to grey
 * @returns {{ data: object|null, error: string|null }}
 */
export async function createStatus(fields) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'You must be logged in', code: NOT_AUTHENTICATED };

    const name = sanitizeString(fields.name, true);
    if (!name) {
        return { data: null, error: 'Status name is required' };
    }
    const nameError = checkMaxLength(name, 100, 'Status name');
    if (nameError) return { data: null, error: nameError.error };

    if (!fields.space_id) {
        return { data: null, error: 'A space is required' };
    }

    try {
        const supabase = await createClient();

        const permissionLevel = await resolveSpacePermission(supabase, fields.space_id, user.id);
        const permissionBlock = blockCreateForPermission(permissionLevel);
        if (permissionBlock) return { data: null, ...permissionBlock };

        const position = await getNextPosition(supabase, 'statuses', { space_id: fields.space_id });

        const { data: createdStatus, error } = await supabase
            .from('statuses')
            .insert({
                name,
                color: fields.color ?? '#6b7280',
                position,
                space_id: fields.space_id,
                created_by: user.id,
            })
            .select()
            .single();

        if (error) {
            const guestLimitResult = toGuestLimitResult(error);
            if (guestLimitResult) return { data: null, ...guestLimitResult };
            return { data: null, error: 'Failed to create status' };
        }

        revalidateTag('statuses', { expire: 0 });
        revalidateTag('task-tree', { expire: 0 });
        return { data: createdStatus, error: null };
    } catch (thrown) {
        console.error('[statuses] create threw', { detail: thrown?.message });
        return { data: null, error: 'Unexpected error creating status' };
    }
}

/**
 * Updates specific fields on a status (name, color, position).
 * `code` is deliberately not accepted here - it identifies the 3 built-in
 * statuses and must never be settable from the client, even indirectly.
 *
 * @param {string} id - Status ID to update
 * @param {object} fields - Partial status fields to update (name, color, position only)
 * @returns {{ data: object|null, error: string|null }}
 */
export async function updateStatus(id, fields) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!id) return { data: null, error: 'Status ID is required' };

    const { color, position } = fields;
    let { name } = fields;

    if (name !== undefined) {
        name = sanitizeString(name, true);
        if (!name) return { data: null, error: 'Status name is required' };
        const nameError = checkMaxLength(name, 100, 'Status name');
        if (nameError) return { data: null, error: nameError.error };
    }

    const updates = {
        ...(name !== undefined && { name }),
        ...(color !== undefined && { color }),
        ...(position !== undefined && { position }),
    };

    try {
        const supabase = await createClient();

        const { data: existingStatus } = await supabase
            .from('statuses')
            .select('space_id, created_by')
            .eq('id', id)
            .maybeSingle();
        if (!existingStatus) return { data: null, error: 'Status not found' };

        const permissionLevel = await resolveSpacePermission(
            supabase,
            existingStatus.space_id,
            user.id,
        );
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: existingStatus.created_by === user.id,
        });
        if (permissionBlock) return { data: null, ...permissionBlock };

        const { data: updatedStatus, error } = await supabase
            .from('statuses')
            .update(updates)
            .eq('id', id)
            .select()
            .maybeSingle();

        if (error || !updatedStatus) {
            return { data: null, error: 'Failed to update status' };
        }

        revalidateTag('statuses', { expire: 0 });
        revalidateTag('task-tree', { expire: 0 });
        return { data: updatedStatus, error: null };
    } catch (thrown) {
        console.error('[statuses] update threw', { id, detail: thrown?.message });
        return { data: null, error: 'Unexpected error updating status' };
    }
}

/**
 * Deletes a status. Refuses if it is the last remaining status or the default status.
 *
 * @param {string} id - Status ID to delete
 * @returns {{ error: string|null }}
 */
export async function deleteStatus(id) {
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!id) return { error: 'Status ID is required' };

    try {
        const supabase = await createClient();

        const { data: target } = await supabase
            .from('statuses')
            .select('is_default, code, space_id, created_by')
            .eq('id', id)
            .single();

        if (!target) return { error: 'Status not found' };

        const permissionLevel = await resolveSpacePermission(supabase, target.space_id, user.id);
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: target.created_by === user.id,
        });
        if (permissionBlock) return permissionBlock;

        // Scoped to this status's own space -- other spaces' statuses must never affect
        // whether this is "the last remaining" one.
        const { count } = await supabase
            .from('statuses')
            .select('*', { count: 'exact', head: true })
            .eq('space_id', target.space_id);

        if (count <= 1) {
            return { error: 'Cannot delete the last remaining status' };
        }

        if (target.is_default) {
            return { error: 'Cannot delete the default status' };
        }
        if (target.code) {
            return { error: 'Cannot delete a built-in status' };
        }

        const { data: deletedStatus, error } = await supabase
            .from('statuses')
            .delete()
            .eq('id', id)
            .select()
            .maybeSingle();

        if (error || !deletedStatus) {
            return { error: 'Status not found' };
        }

        revalidateTag('statuses', { expire: 0 });
        revalidateTag('task-tree', { expire: 0 });
        return { error: null };
    } catch (thrown) {
        console.error('[statuses] delete threw', { id, detail: thrown?.message });
        return { error: 'Unexpected error deleting status' };
    }
}
