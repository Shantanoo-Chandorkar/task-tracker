import {
    PERMISSION_READ_ONLY,
    PERMISSION_RESTRICTED_NOT_OWN,
    PERMISSION_NOT_A_MEMBER,
} from '@/lib/error-codes';

export const COLLABORATOR_PERMISSION_LEVELS = ['full', 'restricted', 'read_only'];

export const PERMISSION_LEVEL_LABELS = {
    full: 'Full',
    restricted: 'Restricted',
    read_only: 'Read-only',
};

/**
 * Resolves the caller's effective permission tier for a space.
 *
 * @param {object} supabase - Request-scoped Supabase client (subject to RLS)
 * @param {string} spaceId - Space being accessed
 * @param {string} userId - Caller's user id
 * @returns {Promise<'owner'|'full'|'restricted'|'read_only'|null>} The tier, or null if the caller has no access
 */
export async function resolveSpacePermission(supabase, spaceId, userId) {
    const { data: space } = await supabase
        .from('spaces')
        .select('owner_id')
        .eq('id', spaceId)
        .maybeSingle();
    if (space?.owner_id === userId) return 'owner';

    const { data: collaborator } = await supabase
        .from('space_collaborators')
        .select('permission_level')
        .eq('space_id', spaceId)
        .eq('user_id', userId)
        .eq('status', 'accepted')
        .maybeSingle();

    return collaborator?.permission_level ?? null;
}

/**
 * Resolves the space a list belongs to.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} listId - List whose space is being looked up
 * @returns {Promise<string|null>} The list's space_id, or null if not found
 */
export async function getSpaceIdForList(supabase, listId) {
    const { data: list } = await supabase
        .from('lists')
        .select('space_id')
        .eq('id', listId)
        .maybeSingle();
    return list?.space_id ?? null;
}

/**
 * Resolves the space a sublist belongs to, via its parent list.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} sublistId - Sublist whose space is being looked up
 * @returns {Promise<string|null>} The sublist's space_id, or null if not found
 */
export async function getSpaceIdForSublist(supabase, sublistId) {
    const { data: sublist } = await supabase
        .from('sublists')
        .select('list_id, lists(space_id)')
        .eq('id', sublistId)
        .maybeSingle();
    return sublist?.lists?.space_id ?? null;
}

/**
 * Resolves the space a task belongs to, via its parent list.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} taskId - Task whose space is being looked up
 * @returns {Promise<string|null>} The task's space_id, or null if not found
 */
export async function getSpaceIdForTask(supabase, taskId) {
    const { data: task } = await supabase
        .from('tasks')
        .select('list_id, lists(space_id)')
        .eq('id', taskId)
        .maybeSingle();
    return task?.lists?.space_id ?? null;
}

/**
 * Guards a create against a caller's permission tier.
 *
 * @param {'owner'|'full'|'restricted'|'read_only'|null} permissionLevel - Caller's tier for the target space
 * @returns {{ error: string, code: string }|null} A refusal to return to the caller, or null to proceed
 */
export function blockCreateForPermission(permissionLevel) {
    if (
        permissionLevel === 'owner' ||
        permissionLevel === 'full' ||
        permissionLevel === 'restricted'
    )
        return null;
    if (permissionLevel === 'read_only') {
        return {
            error: 'Read-only collaborators cannot create new items',
            code: PERMISSION_READ_ONLY,
        };
    }
    return { error: 'You do not have access to this space', code: PERMISSION_NOT_A_MEMBER };
}

/**
 * Guards an update or delete against a caller's permission tier and the target row's ownership.
 *
 * @param {'owner'|'full'|'restricted'|'read_only'|null} permissionLevel - Caller's tier for the target space
 * @param {object} context
 * @param {boolean} context.isOwnRow - Whether the caller created the row being changed
 * @returns {{ error: string, code: string }|null} A refusal to return to the caller, or null to proceed
 */
export function blockWriteForPermission(permissionLevel, { isOwnRow }) {
    if (permissionLevel === 'owner' || permissionLevel === 'full') return null;
    if (permissionLevel === 'restricted') {
        if (isOwnRow) return null;
        return {
            error: 'Restricted collaborators can only edit or delete items they created',
            code: PERMISSION_RESTRICTED_NOT_OWN,
        };
    }
    if (permissionLevel === 'read_only') {
        return { error: 'Read-only collaborators cannot make changes', code: PERMISSION_READ_ONLY };
    }
    return { error: 'You do not have access to this space', code: PERMISSION_NOT_A_MEMBER };
}

/**
 * Attaches `my_permission_level` to each space. Shared by the SSR spaces page and /api/spaces
 * so both compute it identically and hydration never mismatches.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object[]} spaces - Spaces to annotate
 * @param {string|null} userId - Caller's user id, or null if unauthenticated
 * @returns {Promise<object[]>} The same spaces, each with `my_permission_level` added
 */
export async function attachMyPermissionLevel(supabase, spaces, userId) {
    if (!userId) return spaces.map((space) => ({ ...space, my_permission_level: null }));

    const { data: collaboratorRows } = await supabase
        .from('space_collaborators')
        .select('space_id, permission_level')
        .eq('user_id', userId)
        .eq('status', 'accepted');

    const permissionLevelBySpaceId = new Map(
        (collaboratorRows || []).map((collaboratorRow) => [
            collaboratorRow.space_id,
            collaboratorRow.permission_level,
        ]),
    );

    return spaces.map((space) => ({
        ...space,
        my_permission_level:
            space.owner_id === userId ? 'owner' : (permissionLevelBySpaceId.get(space.id) ?? null),
    }));
}
