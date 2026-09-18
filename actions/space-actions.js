'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { getNextPosition } from '@/lib/position';
import { getCurrentUser } from '@/lib/auth/session';
import { NOT_AUTHENTICATED } from '@/lib/error-codes';

/**
 * Creates a new space. Appends it after the last existing space.
 *
 * @param {object} fields
 * @param {string} fields.name - Required space name
 * @param {string} [fields.color] - Hex color string, defaults to grey
 * @returns {{ data: object|null, error: string|null }}
 */
export async function createSpace(fields) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!fields.name || fields.name.trim() === '') {
        return { data: null, error: 'Space name is required' };
    }

    try {
        const supabase = await createClient();

        const position = await getNextPosition(supabase, 'spaces', {});

        const { data: createdSpace, error } = await supabase
            .from('spaces')
            .insert({
                name: fields.name.trim(),
                color: fields.color ?? '#6b7280',
                position,
                owner_id: user.id,
            })
            .select()
            .single();

        if (error) {
            return { data: null, error: 'Failed to create space' };
        }

        revalidateTag('spaces');
        return { data: createdSpace, error: null };
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
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!id) return { data: null, error: 'Space ID is required' };

    try {
        const supabase = await createClient();

        const { data: updatedSpace, error } = await supabase
            .from('spaces')
            .update(fields)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return { data: null, error: 'Failed to update space' };
        }

        revalidateTag('spaces');
        return { data: updatedSpace, error: null };
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
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

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
