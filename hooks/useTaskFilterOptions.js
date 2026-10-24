'use client';

import { useTagsQuery } from '@/hooks/useTagsQuery';
import { useCollaboratorsQuery } from '@/hooks/useCollaboratorsQuery';
import { useSpaceById } from '@/hooks/useSpaceById';

/**
 * Resolves the tag and member option lists for a space's task filter.
 * Shared cache across every consumer - no duplicated lookup logic, no duplicated fetch.
 *
 * @param {string|null} spaceId - Space whose filter options are being resolved
 * @param {object} [options] - SSR-fetched seeds, so the first paint never shows a raw id/placeholder
 * @param {object[]} [options.initialTags] - SSR-fetched tags for this space
 * @param {object[]} [options.initialCollaborators] - SSR-fetched accepted collaborators for this space
 * @param {object[]} [options.initialSpaces] - SSR-fetched spaces, for the owner's display name
 * @returns {{tags: object[], members: {id: string, label: string}[], tagsLoading: boolean, membersLoading: boolean}}
 */
export function useTaskFilterOptions(spaceId, options = {}) {
    const { initialTags, initialCollaborators, initialSpaces } = options;
    const { data: tags = [], isLoading: tagsLoading } = useTagsQuery(spaceId, {
        initialData: initialTags,
    });
    const { data: collaborators = [], isLoading: membersLoading } = useCollaboratorsQuery(spaceId, {
        initialData: initialCollaborators,
    });
    const space = useSpaceById(spaceId, { initialData: initialSpaces });

    const members = [
        ...(space ? [{ id: space.owner_id, label: space.owner_display_name ?? 'Owner' }] : []),
        ...collaborators.map((collaborator) => ({
            id: collaborator.user_id,
            label: collaborator.display_name ?? collaborator.requester_email,
        })),
    ];

    return { tags, members, tagsLoading, membersLoading };
}
