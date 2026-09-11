'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';

/**
 * Creates a new status. Appends it after the last existing status.
 *
 * @param {object} fields
 * @param {string} fields.name - Required status name
 * @param {string} [fields.id] - Client-generated UUID; lets a replayed offline
 *   create be idempotent instead of inserting a second row
 * @param {string} [fields.color] - Hex color string, defaults to grey
 * @returns {{ data: object|null, error: string|null }}
 */
export async function createStatus(fields) {
    if (!fields.name || fields.name.trim() === '') {
        return { data: null, error: 'Status name is required' };
    }

    try {
        const supabase = await createClient();

        const { data: existing } = await supabase
            .from('statuses')
            .select('position')
            .order('position', { ascending: false })
            .limit(1);

        const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

        const { data, error } = await supabase
            .from('statuses')
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
            // lost — the row already exists, so this isn't a real failure, just an echo.
            if (error.code === '23505' && fields.id) {
                const { data: existingStatus } = await supabase
                    .from('statuses')
                    .select()
                    .eq('id', fields.id)
                    .single();
                if (existingStatus) return { data: existingStatus, error: null };
            }
            return { data: null, error: 'Failed to create status' };
        }

        revalidateTag('statuses');
        revalidateTag('task-tree');
        return { data, error: null };
    } catch {
        return { data: null, error: 'Unexpected error creating status' };
    }
}

/**
 * Updates specific fields on a status (name, color, position).
 * `code` is deliberately not accepted here — it identifies the 3 built-in
 * statuses and must never be settable from the client, even indirectly.
 *
 * @param {string} id - Status ID to update
 * @param {object} fields - Partial status fields to update (name, color, position only)
 * @returns {{ data: object|null, error: string|null }}
 */
export async function updateStatus(id, fields) {
    if (!id) return { data: null, error: 'Status ID is required' };

    const { name, color, position } = fields;
    const updates = {
        ...(name !== undefined && { name }),
        ...(color !== undefined && { color }),
        ...(position !== undefined && { position }),
    };

    try {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('statuses')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return { data: null, error: 'Failed to update status' };
        }

        revalidateTag('statuses');
        revalidateTag('task-tree');
        return { data, error: null };
    } catch {
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
    if (!id) return { error: 'Status ID is required' };

    try {
        const supabase = await createClient();

        const { count } = await supabase
            .from('statuses')
            .select('*', { count: 'exact', head: true });

        if (count <= 1) {
            return { error: 'Cannot delete the last remaining status' };
        }

        const { data: target } = await supabase
            .from('statuses')
            .select('is_default, code')
            .eq('id', id)
            .single();

        if (target?.is_default) {
            return { error: 'Cannot delete the default status' };
        }
        if (target?.code) {
            return { error: 'Cannot delete a built-in status' };
        }

        const { error } = await supabase.from('statuses').delete().eq('id', id);

        if (error) {
            return { error: 'Failed to delete status' };
        }

        revalidateTag('statuses');
        revalidateTag('task-tree');
        return { error: null };
    } catch {
        return { error: 'Unexpected error deleting status' };
    }
}
