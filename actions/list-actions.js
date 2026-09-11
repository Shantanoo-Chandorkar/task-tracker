'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';

/**
 * Creates a new list under a space. Appends it after the last existing list
 * in that space.
 *
 * @param {object} fields
 * @param {string} fields.name - Required list name
 * @param {string} fields.space_id - Required parent space ID
 * @param {string} [fields.id] - Client-generated UUID; lets a replayed offline
 *   create be idempotent instead of inserting a second row
 * @param {string} [fields.color] - Hex color string, defaults to grey
 * @returns {{ data: object|null, error: string|null }}
 */
export async function createList(fields) {
    if (!fields.name || fields.name.trim() === '') {
        return { data: null, error: 'List name is required' };
    }
    if (!fields.space_id) {
        return { data: null, error: 'A space is required' };
    }

    try {
        const supabase = await createClient();

        const { data: existing } = await supabase
            .from('lists')
            .select('position')
            .eq('space_id', fields.space_id)
            .order('position', { ascending: false })
            .limit(1);

        const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

        const { data, error } = await supabase
            .from('lists')
            .insert({
                id: fields.id ?? crypto.randomUUID(),
                name: fields.name.trim(),
                space_id: fields.space_id,
                color: fields.color ?? '#6b7280',
                position,
            })
            .select()
            .single();

        if (error) {
            // A replayed offline create can land after the first attempt's response was
            // lost - the row already exists, so this isn't a real failure, just an echo.
            if (error.code === '23505' && fields.id) {
                const { data: existingList } = await supabase
                    .from('lists')
                    .select()
                    .eq('id', fields.id)
                    .single();
                if (existingList) return { data: existingList, error: null };
            }
            return { data: null, error: 'Failed to create list' };
        }

        revalidateTag('lists');
        return { data, error: null };
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
    if (!id) return { data: null, error: 'List ID is required' };

    try {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('lists')
            .update(fields)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return { data: null, error: 'Failed to update list' };
        }

        revalidateTag('lists');
        return { data, error: null };
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
