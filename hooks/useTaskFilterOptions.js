'use client';

import { useTagsQuery } from '@/hooks/useTagsQuery';
import { useCollaboratorsQuery } from '@/hooks/useCollaboratorsQuery';
import { useSpaceById } from '@/hooks/useSpaceById';

/**
 * Resolves the tag and member option lists for a space's task filter.
 * Shared cache across every consumer - no duplicated lookup logic, no duplicated fetch.
 *
 * @param {string|null} spaceId - Space whose filter options are being resolved
 * @returns {{tags: object[], members: {id: string, label: string}[], tagsLoading: boolean, membersLoading: boolean}}
 */
export function useTaskFilterOptions(spaceId) {
    const { data: tags = [], isLoading: tagsLoading } = useTagsQuery(spaceId);
    const { data: collaborators = [], isLoading: membersLoading } = useCollaboratorsQuery(spaceId);
    const space = useSpaceById(spaceId);

    const members = [
        ...(space ? [{ id: space.owner_id, label: space.owner_display_name ?? 'Owner' }] : []),
        ...collaborators.map((collaborator) => ({
            id: collaborator.user_id,
            label: collaborator.display_name ?? collaborator.requester_email,
        })),
    ];

    return { tags, members, tagsLoading, membersLoading };
}
