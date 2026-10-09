import { isUuid } from '@/lib/validation';
import { throwIfQueryFailed } from '@/lib/supabase/throw-if-query-failed';
import { TAG_ASSIGN_FAILED, TAG_LIMIT_REACHED, TAG_NOT_FOUND } from '@/lib/error-codes';
import { MAX_TAGS_PER_TASK } from './tag-limits';

const TAG_NOT_FOUND_FAILURE = { error: 'Tag not found', code: TAG_NOT_FOUND };
const TAG_LIMIT_FAILURE = {
    error: `A task can have at most ${MAX_TAGS_PER_TASK} tags`,
    code: TAG_LIMIT_REACHED,
};

/**
 * Turns the client's tag ids into a list of distinct uuids, or the failure to return.
 *
 * @param {unknown} rawTagIds - Tag ids sent by the client
 * @returns {{ tagIds: string[], failure: null }|{ tagIds: null, failure: object }} Distinct ids, or why not
 */
function readDistinctTagIds(rawTagIds) {
    if (!Array.isArray(rawTagIds) || !rawTagIds.every(isUuid)) {
        return { tagIds: null, failure: TAG_NOT_FOUND_FAILURE };
    }
    const tagIds = [...new Set(rawTagIds)];
    // Refused before any query, so an oversized request costs nothing
    if (tagIds.length > MAX_TAGS_PER_TASK) return { tagIds: null, failure: TAG_LIMIT_FAILURE };
    return { tagIds, failure: null };
}

/**
 * Attaches existing tags of a task's own space to the task in one write; tags already on the task are left alone.
 * The caller must already have checked that the user may change the task.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} target
 * @param {string} target.taskId - Task to tag
 * @param {string} target.spaceId - Space the task belongs to; every tag must belong to it as well
 * @param {unknown} target.tagIds - Tag ids sent by the client
 * @returns {Promise<{ error: null }|{ error: string, code: string }>} `{ error: null }` when attached
 * @throws {Error} Generic SERVER_LOAD_FAILED error when a read fails
 */
export async function attachTagsToTask(supabase, { taskId, spaceId, tagIds: rawTagIds }) {
    const { tagIds, failure } = readDistinctTagIds(rawTagIds);
    if (failure) return failure;
    if (tagIds.length === 0) return { error: null };

    const attachedResult = await supabase.from('task_tags').select('tag_id').eq('task_id', taskId);
    throwIfQueryFailed('[tags] read tags of task', attachedResult);
    const tagCountAfter = new Set([
        ...(attachedResult.data ?? []).map((row) => row.tag_id),
        ...tagIds,
    ]).size;
    if (tagCountAfter > MAX_TAGS_PER_TASK) return TAG_LIMIT_FAILURE;

    // A tag of another space looks the same as a missing one, so its existence is never confirmed
    const spaceTagsResult = await supabase
        .from('tags')
        .select('id')
        .in('id', tagIds)
        .eq('space_id', spaceId);
    throwIfQueryFailed('[tags] read tags of space', spaceTagsResult);
    if ((spaceTagsResult.data ?? []).length !== tagIds.length) return TAG_NOT_FOUND_FAILURE;

    const { error: attachError } = await supabase.from('task_tags').upsert(
        tagIds.map((tagId) => ({ task_id: taskId, tag_id: tagId })),
        { onConflict: 'task_id,tag_id', ignoreDuplicates: true },
    );
    if (attachError) {
        console.error('[tags] attach failed', { taskId, code: attachError.code });
        return { error: 'Failed to tag task', code: TAG_ASSIGN_FAILED };
    }

    return { error: null };
}
