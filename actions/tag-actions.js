'use server';

import { sanitizeString, checkMaxLength } from '@/lib/validation';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import {
    getSpaceIdForTask,
    resolveSpacePermission,
    blockWriteForPermission,
    blockCreateForPermission,
} from '@/lib/permissions/space-permissions';
import {
    TAG_ID_REQUIRED,
    TAG_NOT_FOUND,
    TAG_SPACE_ID_REQUIRED,
    TAG_DELETE_FAILED,
    TAG_ALREADY_ON_TASK,
} from '@/lib/error-codes';

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
 * @returns {{ data: { id: string, name: string }|null, error: string|null, code: string|undefined }}
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

        if (attachError) {
            if (attachError.code === UNIQUE_VIOLATION) {
                return {
                    data: null,
                    error: 'Tag is already assigned to the task',
                    code: TAG_ALREADY_ON_TASK,
                };
            }
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

/**
 * Deletes a tag entity from a space entirely.
 *
 * `task_tags` cascades, so every task using it loses the tag automatically.
 *
 * @param {string} tagId - Tag id to delete
 * @returns {{ error: string|null, code: string|null }}
 */
export const deleteTag = withAuthenticatedAction(
    '[tags] delete',
    'Unexpected error deleting tag',
    async (user, supabase, tagId) => {
        if (!tagId) return { error: 'Tag ID is required', code: TAG_ID_REQUIRED };

        const { data: target } = await supabase
            .from('tags')
            .select('space_id, created_by')
            .eq('id', tagId)
            .maybeSingle();

        if (!target) return { error: 'Tag not found', code: TAG_NOT_FOUND };

        const permissionLevel = await resolveSpacePermission(supabase, target.space_id, user.id);
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: target.created_by === user.id,
        });
        if (permissionBlock) return permissionBlock;

        const { data: deletedTag, error } = await supabase
            .from('tags')
            .delete()
            .eq('id', tagId)
            .select()
            .maybeSingle();

        if (error || !deletedTag) return { error: 'Tag not found', code: TAG_NOT_FOUND };

        return { error: null, code: null };
    },
    { hasData: false },
);

/**
 * Deletes every tag in a space.
 *
 * Permission is checked once for the whole action (like creating a tag), not per row.
 * RLS still filters the delete per caller, so a restricted wipe only removes own tags.
 *
 * @param {string} spaceId - Space to clear all tags from
 * @returns {{ count: number, error: string|null, code: string|null }}
 */
export const deleteAllTagsInSpace = withAuthenticatedAction(
    '[tags] delete all in space',
    'Unexpected error deleting tags',
    async (user, supabase, spaceId) => {
        if (!spaceId) {
            return { count: 0, error: 'Space ID is required', code: TAG_SPACE_ID_REQUIRED };
        }

        const permissionLevel = await resolveSpacePermission(supabase, spaceId, user.id);
        const permissionBlock = blockCreateForPermission(permissionLevel);
        if (permissionBlock) return { count: 0, ...permissionBlock };

        const { data: deletedTags, error } = await supabase
            .from('tags')
            .delete()
            .eq('space_id', spaceId)
            .select('id');

        if (error) return { count: 0, error: 'Failed to delete tags', code: TAG_DELETE_FAILED };

        return { count: deletedTags?.length ?? 0, error: null, code: null };
    },
    { hasData: false },
);
