'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';

/**
 * Creates a new space. Appends it after the last existing space.
 *
 * @param {object} fields
 * @param {string} fields.name - Required space name
 * @param {string} [fields.id] - Client-generated UUID; lets a replayed offline
 *   create be idempotent instead of inserting a second row
 * @param {string} [fields.color] - Hex color string, defaults to grey
 * @returns {{ data: object|null, error: string|null }}
 */
export async function createSpace(fields) {
    if (!fields.name || fields.name.trim() === '') {
        return { data: null, error: 'Space name is required' };
    }

    try {
        const supabase = await createClient();

        const { data: existing } = await supabase
            .from('spaces')
            .select('position')
            .order('position', { ascending: false })
            .limit(1);

        const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

        const { data, error } = await supabase
            .from('spaces')
            .insert({
                id: fields.id ?? crypto.randomUUID(),
                name: fields.name.trim(),
                color: fields.color ?? '#6b7280',
                position,
            })
            .select()
            .single();

        if (error) {
            // A replayed offline create can land after the first attempt's response was
            // lost - the row already exists, so this isn't a real failure, just an echo.
            if (error.code === '23505' && fields.id) {
                const { data: existingSpace } = await supabase
                    .from('spaces')
                    .select()
                    .eq('id', fields.id)
                    .single();
                if (existingSpace) return { data: existingSpace, error: null };
            }
            return { data: null, error: 'Failed to create space' };
        }

        revalidateTag('spaces');
        return { data, error: null };
    } catch {
        return { data: null, error: 'Unexpected error creating space' };
    }
}

/**
 * Updates specific fields on a space (name, color, position).
 *
 * @param {string} id - Space ID to update
 * @param {object} fields - Partial space fields to update
 * @returns {{ data: object|null, error: string|null }}
 */
export async function updateSpace(id, fields) {
    if (!id) return { data: null, error: 'Space ID is required' };

    try {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('spaces')
            .update(fields)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return { data: null, error: 'Failed to update space' };
        }

        revalidateTag('spaces');
        return { data, error: null };
    } catch {
        return { data: null, error: 'Unexpected error updating space' };
    }
}

/**
 * Deletes a space. Cascades to its lists and their tasks (ON DELETE CASCADE).
 *
 * @param {string} id - Space ID to delete
 * @returns {{ error: string|null }}
 */
export async function deleteSpace(id) {
    if (!id) return { error: 'Space ID is required' };

    try {
        const supabase = await createClient();

        const { error } = await supabase.from('spaces').delete().eq('id', id);

        if (error) {
            return { error: 'Failed to delete space' };
        }

        revalidateTag('spaces');
        revalidateTag('lists');
        revalidateTag('task-tree');
        return { error: null };
    } catch {
        return { error: 'Unexpected error deleting space' };
    }
}
