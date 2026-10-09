'use server';

import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { createLabelActions } from '@/lib/space-labels/create-label-actions';
import { attachTagsToTask } from '@/lib/tags/attach-tags-to-task';
import { loadTaskForTagWrite } from '@/lib/tags/load-task-for-tag-write';
import {
    resolveSpacePermission,
    blockCreateForPermission,
} from '@/lib/permissions/space-permissions';
import {
    TAG_ID_REQUIRED,
    TAG_NOT_FOUND,
    TAG_SPACE_ID_REQUIRED,
    TAG_DELETE_FAILED,
    TAG_NAME_TAKEN,
} from '@/lib/error-codes';

const tagActions = createLabelActions({
    table: 'tags',
    noun: 'Tag',
    logName: 'tags',
    codes: { idRequired: TAG_ID_REQUIRED, notFound: TAG_NOT_FOUND },
    nameTakenFailure: { error: 'A tag with that name already exists', code: TAG_NAME_TAKEN },
});

/**
 * Creates a tag at the end of its space's order.
 *
 * @param {object} fields
 * @param {string} [fields.id] - Optional client-made UUID; a retry with the same id returns the first try's row
 * @param {string} fields.name - Required tag name, unique per space ignoring case
 * @param {string} fields.space_id - Required space this tag belongs to
 * @param {string} [fields.color] - `#rrggbb`, defaults to grey
 * @returns {{ data: object|null, error: string|null, code?: string }}
 */
export const createTag = tagActions.create;

/**
 * Updates the name, colour or position of a tag.
 *
 * @param {string} id - Tag to update
 * @param {object} fields - Partial fields to update (name, color, position only)
 * @returns {{ data: object|null, error: string|null, code?: string }}
 */
export const updateTag = tagActions.update;

/**
 * Deletes a tag from its space entirely; `task_tags` cascades, so every task using it loses the tag.
 *
 * @param {string} id - Tag to delete
 * @returns {{ error: string|null, code?: string }}
 */
export const deleteTag = tagActions.remove;

/**
 * Attaches existing tags of the task's space to a task, in one write.
 *
 * @param {object} fields
 * @param {string} fields.taskId - Task to tag
 * @param {string[]} fields.tagIds - Ids of the tags to attach; at most 10 tags per task in total
 * @returns {{ error: string|null, code?: string }}
 */
export const assignTagsToTask = withAuthenticatedAction(
    '[tags] assign to task',
    'Unexpected error tagging task',
    async (user, supabase, fields) => {
        if (!fields.taskId) return { error: 'A task is required' };
        if (!Array.isArray(fields.tagIds) || fields.tagIds.length === 0) {
            return { error: 'Choose at least one tag', code: TAG_NOT_FOUND };
        }

        const { spaceId, failure } = await loadTaskForTagWrite(supabase, user, fields.taskId);
        if (failure) return failure;

        return attachTagsToTask(supabase, {
            taskId: fields.taskId,
            spaceId,
            tagIds: fields.tagIds,
        });
    },
    { hasData: false },
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

        const { failure } = await loadTaskForTagWrite(supabase, user, fields.taskId);
        if (failure) return failure;

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

        const permissionLevel = await resolveSpacePermission(supabase, spaceId);
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
