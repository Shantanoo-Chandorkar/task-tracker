'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';

/**
 * Creates a new sublist under a list. Appends it after the last existing sublist in that list.
 *
 * @param {object} fields
 * @param {string} fields.name - Required sublist name
 * @param {string} fields.list_id - Required parent list ID
 * @param {string} [fields.id] - Client-generated UUID; lets a replayed offline
 *   create be idempotent instead of inserting a second row
 * @param {string} [fields.color] - Hex color string, defaults to grey
 * @returns {{ data: object|null, error: string|null }}
 */
export async function createSublist(fields) {
    if (!fields.name || fields.name.trim() === '') {
        return { data: null, error: 'Sublist name is required' };
    }
    if (!fields.list_id) {
        return { data: null, error: 'A list is required' };
    }

    try {
        const supabase = await createClient();

        const { data: existing } = await supabase
            .from('sublists')
            .select('position')
            .eq('list_id', fields.list_id)
            .order('position', { ascending: false })
            .limit(1);

        const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

        const { data: createdSublist, error } = await supabase
            .from('sublists')
            .insert({
                id: fields.id ?? crypto.randomUUID(),
                name: fields.name.trim(),
                list_id: fields.list_id,
                color: fields.color ?? '#6b7280',
                position,
            })
            .select()
            .single();

        if (error) {
            // A replayed offline create can land after the first attempt's response was
            // lost — the row already exists, so this isn't a real failure, just an echo.
            if (error.code === '23505' && fields.id) {
                const { data: existingSublist } = await supabase
                    .from('sublists')
                    .select()
                    .eq('id', fields.id)
                    .single();
                if (existingSublist) return { data: existingSublist, error: null };
            }
            return { data: null, error: 'Failed to create sublist' };
        }

        revalidateTag('sublists');
        return { data: createdSublist, error: null };
    } catch {
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
    if (!sublistId) return { data: null, error: 'Sublist ID is required' };

    try {
        const supabase = await createClient();

        const { data: updatedSublist, error } = await supabase
            .from('sublists')
            .update(fields)
            .eq('id', sublistId)
            .select()
            .single();

        if (error) {
            return { data: null, error: 'Failed to update sublist' };
        }

        revalidateTag('sublists');
        return { data: updatedSublist, error: null };
    } catch {
        return { data: null, error: 'Unexpected error updating sublist' };
    }
}

/**
 * Deletes a sublist, cascading to its tasks — callers should warn with the task count first.
 *
 * @param {string} sublistId - Sublist ID to delete
 * @returns {{ error: string|null }}
 */
export async function deleteSublist(sublistId) {
    if (!sublistId) return { error: 'Sublist ID is required' };

    try {
        const supabase = await createClient();

        const { error } = await supabase.from('sublists').delete().eq('id', sublistId);

        if (error) {
            return { error: 'Failed to delete sublist' };
        }

        revalidateTag('sublists');
        revalidateTag('task-tree');
        return { error: null };
    } catch {
        return { error: 'Unexpected error deleting sublist' };
    }
}
