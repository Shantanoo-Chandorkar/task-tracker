'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { getNextPosition } from '@/lib/position';
import { getCurrentUser } from '@/lib/auth/session';
import { NOT_AUTHENTICATED } from '@/lib/error-codes';

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
export async function createList(fields) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!fields.name || fields.name.trim() === '') {
        return { data: null, error: 'List name is required' };
    }
    if (!fields.space_id) {
        return { data: null, error: 'A space is required' };
    }

    try {
        const supabase = await createClient();

        const position = await getNextPosition(supabase, 'lists', { space_id: fields.space_id });

        const { data: createdList, error } = await supabase
            .from('lists')
            .insert({
                name: fields.name.trim(),
                space_id: fields.space_id,
                color: fields.color ?? '#6b7280',
                position,
            })
            .select()
            .single();

        if (error) {
            return { data: null, error: 'Failed to create list' };
        }

        revalidateTag('lists');
        return { data: createdList, error: null };
    } catch {
        return { data: null, error: 'Unexpected error creating list' };
    }
}

/**
 * Updates specific fields on a list (name, color, position).
 *
 * @param {string} id - List ID to update
 * @param {object} fields - Partial list fields to update
 * @returns {{ data: object|null, error: string|null }}
 */
export async function updateList(id, fields) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!id) return { data: null, error: 'List ID is required' };

    try {
        const supabase = await createClient();

        const { data: updatedList, error } = await supabase
            .from('lists')
            .update(fields)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return { data: null, error: 'Failed to update list' };
        }

        revalidateTag('lists');
        return { data: updatedList, error: null };
    } catch {
        return { data: null, error: 'Unexpected error updating list' };
    }
}

/**
 * Deletes a list. Cascades to its tasks (ON DELETE CASCADE) - callers are
 * expected to warn the user with the task count before calling this.
 *
 * @param {string} id - List ID to delete
 * @returns {{ error: string|null }}
 */
export async function deleteList(id) {
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!id) return { error: 'List ID is required' };

    try {
        const supabase = await createClient();

        const { error } = await supabase.from('lists').delete().eq('id', id);

        if (error) {
            return { error: 'Failed to delete list' };
        }

        revalidateTag('lists');
        revalidateTag('task-tree');
        return { error: null };
    } catch {
        return { error: 'Unexpected error deleting list' };
    }
}
