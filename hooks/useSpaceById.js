'use client';

import { useSpacesQuery } from '@/hooks/useSpacesQuery';

/**
 * Derives a single space's full row from the already-shared `['spaces']` cache.
 *
 * @param {string|null|undefined} spaceId - The space to look up
 * @param {object} [options] - Extra react-query options (e.g. initialData) forwarded to useSpacesQuery
 * @returns {object|null} The space row, or null while unresolved / not found
 */
export function useSpaceById(spaceId, options = {}) {
    const { data: spaces = [] } = useSpacesQuery(options);
    return spaces.find((space) => space.id === spaceId) ?? null;
}
