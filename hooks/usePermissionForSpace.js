'use client';

import { useSpacesQuery } from '@/hooks/useSpacesQuery';

/**
 * Derives the caller's permission tier for a space from the already-shared `['spaces']` cache.
 * A UX hint only - RLS and the app-layer pre-checks are the real backstop if a control is missed.
 *
 * @param {string|null|undefined} spaceId - The space whose permission is being looked up
 * @param {object} [options] - Extra react-query options (e.g. initialData) forwarded to useSpacesQuery
 * @returns {'owner'|'full'|'restricted'|'read_only'|null} The caller's tier, or null while unresolved / not a member
 */
export function usePermissionForSpace(spaceId, options = {}) {
    const { data: spaces = [] } = useSpacesQuery(options);
    return spaces.find((space) => space.id === spaceId)?.my_permission_level ?? null;
}
