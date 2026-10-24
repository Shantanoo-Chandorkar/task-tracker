import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTaskFilterOptions } from './useTaskFilterOptions';

const SPACE_ID = 'space-1';

const state = vi.hoisted(() => ({ tagsOptions: null, collaboratorsOptions: null }));

// Mirrors TanStack Query's real initialData behavior: the first render already resolves with it.
vi.mock('@/hooks/useTagsQuery', () => ({
    useTagsQuery: (spaceId, options) => {
        state.tagsOptions = options;
        return { data: options?.initialData ?? [], isLoading: !options?.initialData };
    },
}));
vi.mock('@/hooks/useCollaboratorsQuery', () => ({
    useCollaboratorsQuery: (spaceId, options) => {
        state.collaboratorsOptions = options;
        return { data: options?.initialData ?? [], isLoading: !options?.initialData };
    },
}));
vi.mock('@/hooks/useSpaceById', () => ({
    useSpaceById: (spaceId, options) =>
        options?.initialData?.find((space) => space.id === spaceId) ?? null,
}));

describe('useTaskFilterOptions', () => {
    it('resolves tag names on first render when given initialTags, never the raw id', () => {
        const { result } = renderHook(() =>
            useTaskFilterOptions(SPACE_ID, {
                initialTags: [{ id: 'tag-1', name: 'Urgent' }],
            }),
        );

        expect(result.current.tags).toEqual([{ id: 'tag-1', name: 'Urgent' }]);
        expect(result.current.tagsLoading).toBe(false);
    });

    it('resolves the owner label from initialSpaces, never the "Owner" placeholder', () => {
        const { result } = renderHook(() =>
            useTaskFilterOptions(SPACE_ID, {
                initialSpaces: [
                    { id: SPACE_ID, owner_id: 'owner-1', owner_display_name: 'Priya Shah' },
                ],
            }),
        );

        expect(result.current.members).toEqual(
            expect.arrayContaining([{ id: 'owner-1', label: 'Priya Shah' }]),
        );
    });

    it('resolves collaborator display names on first render when given initialCollaborators', () => {
        const { result } = renderHook(() =>
            useTaskFilterOptions(SPACE_ID, {
                initialCollaborators: [
                    {
                        user_id: 'user-2',
                        display_name: 'Jordan Lee',
                        requester_email: 'jordan@example.com',
                    },
                ],
            }),
        );

        expect(result.current.members).toEqual(
            expect.arrayContaining([{ id: 'user-2', label: 'Jordan Lee' }]),
        );
        expect(result.current.membersLoading).toBe(false);
    });

    it('forwards each initial value to its own query as initialData', () => {
        renderHook(() =>
            useTaskFilterOptions(SPACE_ID, {
                initialTags: [{ id: 'tag-1', name: 'Urgent' }],
                initialCollaborators: [{ user_id: 'user-2', display_name: 'Jordan Lee' }],
            }),
        );

        expect(state.tagsOptions).toMatchObject({ initialData: [{ id: 'tag-1', name: 'Urgent' }] });
        expect(state.collaboratorsOptions).toMatchObject({
            initialData: [{ user_id: 'user-2', display_name: 'Jordan Lee' }],
        });
    });
});
