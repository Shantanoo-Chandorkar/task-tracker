'use server';

import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import {
    reorderListsInSpace,
    reorderOwnedSpaces,
    reorderStatusesInSpace,
    reorderSublistsInList,
    reorderTagsInSpace,
} from '@/lib/reorder/reorder-rows';

/**
 * Saves a new order for the caller's own spaces in one request.
 *
 * @param {string[]} orderedSpaceIds - Ids of every space the caller owns, in the wanted order
 * @returns {{ error: string|null, code: string|undefined }}
 */
export const reorderSpaces = withAuthenticatedAction(
    '[reorder] spaces',
    'Unexpected error saving the order',
    (user, supabase, orderedSpaceIds) => reorderOwnedSpaces(supabase, user, orderedSpaceIds),
    { hasData: false },
);

/**
 * Saves a new order for the lists of one space in one request.
 *
 * @param {string} spaceId - Space the lists belong to
 * @param {string[]} orderedListIds - Ids of the space's lists, in the wanted order
 * @returns {{ error: string|null, code: string|undefined }}
 */
export const reorderLists = withAuthenticatedAction(
    '[reorder] lists',
    'Unexpected error saving the order',
    (user, supabase, spaceId, orderedListIds) =>
        reorderListsInSpace(supabase, user, spaceId, orderedListIds),
    { hasData: false },
);

/**
 * Saves a new order for the sublists of one list in one request.
 *
 * @param {string} listId - List the sublists belong to
 * @param {string[]} orderedSublistIds - Ids of the list's sublists, in the wanted order
 * @returns {{ error: string|null, code: string|undefined }}
 */
export const reorderSublists = withAuthenticatedAction(
    '[reorder] sublists',
    'Unexpected error saving the order',
    (user, supabase, listId, orderedSublistIds) =>
        reorderSublistsInList(supabase, user, listId, orderedSublistIds),
    { hasData: false },
);

/**
 * Saves a new order for the statuses of one space in one request.
 *
 * @param {string} spaceId - Space the statuses belong to
 * @param {string[]} orderedStatusIds - Ids of the space's statuses, in the wanted order
 * @returns {{ error: string|null, code: string|undefined }}
 */
export const reorderStatuses = withAuthenticatedAction(
    '[reorder] statuses',
    'Unexpected error saving the order',
    (user, supabase, spaceId, orderedStatusIds) =>
        reorderStatusesInSpace(supabase, user, spaceId, orderedStatusIds),
    { hasData: false },
);

/**
 * Saves a new order for the tags of one space in one request.
 *
 * @param {string} spaceId - Space the tags belong to
 * @param {string[]} orderedTagIds - Ids of the space's tags, in the wanted order
 * @returns {{ error: string|null, code: string|undefined }}
 */
export const reorderTags = withAuthenticatedAction(
    '[reorder] tags',
    'Unexpected error saving the order',
    (user, supabase, spaceId, orderedTagIds) =>
        reorderTagsInSpace(supabase, user, spaceId, orderedTagIds),
    { hasData: false },
);
