'use server';

import { sanitizeString, checkMaxLength } from '@/lib/validation';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import {
    getSpaceIdForTask,
    resolveSpacePermission,
    blockWriteForPermission,
} from '@/lib/permissions/space-permissions';

const UNIQUE_VIOLATION = '23505';

/**
 * Finds an existing tag in the space by case-insensitive name, or creates one.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} spaceId - Space the tag belongs to
 * @param {string} name - Trimmed, length-checked tag name
 * @param {string} userId - Caller, recorded as the tag's creator if it's newly created
 * @returns {Promise<{ id: string, error: object|null }>} The tag's id, or an error if creation genuinely failed
 */
async function findOrCreateTag(supabase, spaceId, name, userId) {
    const { data: createdTag, error: createError } = await supabase
        .from('tags')
        .insert({ space_id: spaceId, name, created_by: userId })
        .select('id')
        .single();

    if (!createError) return { id: createdTag.id, error: null };
    if (createError.code !== UNIQUE_VIOLATION) return { id: null, error: createError };

    // Name collided case-insensitively with an existing tag - reuse it instead of erroring.
    const { data: spaceTags } = await supabase
        .from('tags')
        .select('id, name')
        .eq('space_id', spaceId);
    const existingTag = (spaceTags || []).find(
        (tag) => tag.name.toLowerCase() === name.toLowerCase(),
    );
    return existingTag ? { id: existingTag.id, error: null } : { id: null, error: createError };
}

/**
 * Attaches a tag to a task, creating the tag in the space first if it doesn't already exist.
 *
 * @param {object} fields
 * @param {string} fields.taskId - Task to tag
 * @param {string} fields.name - Tag name, matched case-insensitively against existing tags
 * @returns {{ data: { id: string, name: string }|null, error: string|null }}
 */
export const addTagToTask = withAuthenticatedAction(
    '[tags] add to task',
    'Unexpected error adding tag',
    async (user, supabase, fields) => {
        const name = sanitizeString(fields.name, true);
        if (!name) return { data: null, error: 'Tag name is required' };
        const nameError = checkMaxLength(name, 50, 'Tag name');
        if (nameError) return { data: null, error: nameError.error };

        if (!fields.taskId) return { data: null, error: 'A task is required' };

        const spaceId = await getSpaceIdForTask(supabase, fields.taskId);
        if (!spaceId) return { data: null, error: 'Task not found' };

        const { data: task } = await supabase
            .from('tasks')
            .select('created_by')
            .eq('id', fields.taskId)
            .maybeSingle();

        // Gated like editing the task itself, not like creating a new row - tagging changes the task.
        const permissionLevel = await resolveSpacePermission(supabase, spaceId, user.id);
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: task?.created_by === user.id,
        });
        if (permissionBlock) return { data: null, ...permissionBlock };

        const { id: tagId, error: tagError } = await findOrCreateTag(
            supabase,
            spaceId,
            name,
            user.id,
        );
        if (tagError) {
            const guestLimitResult = toGuestLimitResult(tagError);
            if (guestLimitResult) return { data: null, ...guestLimitResult };
            return { data: null, error: 'Failed to create tag' };
        }

        const { error: attachError } = await supabase
            .from('task_tags')
            .insert({ task_id: fields.taskId, tag_id: tagId });

        if (attachError && attachError.code !== UNIQUE_VIOLATION) {
            return { data: null, error: 'Failed to tag task' };
        }

        return { data: { id: tagId, name }, error: null };
    },
);

/**
 * Detaches a tag from a task. The tag itself stays in the space for reuse on other tasks.
 *
 * @param {object} fields
 * @param {string} fields.taskId - Task to untag
 * @param {string} fields.tagId - Tag to remove from it
 * @returns {{ error: string|null }}
 */
export const removeTagFromTask = withAuthenticatedAction(
    '[tags] remove from task',
    'Unexpected error removing tag',
    async (user, supabase, fields) => {
        if (!fields.taskId || !fields.tagId) {
            return { error: 'A task and tag are required' };
        }

        const spaceId = await getSpaceIdForTask(supabase, fields.taskId);
        if (!spaceId) return { error: 'Task not found' };

        const { data: task } = await supabase
            .from('tasks')
            .select('created_by')
            .eq('id', fields.taskId)
            .maybeSingle();

        const permissionLevel = await resolveSpacePermission(supabase, spaceId, user.id);
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: task?.created_by === user.id,
        });
        if (permissionBlock) return permissionBlock;

        const { error } = await supabase
            .from('task_tags')
            .delete()
            .eq('task_id', fields.taskId)
            .eq('tag_id', fields.tagId);

        if (error) return { error: 'Failed to remove tag' };

        return { error: null };
    },
    { hasData: false },
);
