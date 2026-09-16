'use client';

import { useSpacesQuery } from '@/hooks/useSpacesQuery';
import { useListsQuery } from '@/hooks/useListsQuery';

/**
 * Space + List name header above the status tiles — reads the shared `['spaces']`/`['lists']` cache.
 * `initialSpaces`/`initialLists` seed that cache from SSR to avoid a hydration mismatch.
 *
 * @param {object} props
 * @param {string} props.listId - The list currently being viewed
 * @param {object[]} [props.initialSpaces] - SSR-fetched spaces, hydrates the `['spaces']` query
 * @param {object[]} [props.initialLists] - SSR-fetched lists, hydrates the `['lists']` query
 */
export default function ListHeader({ listId, initialSpaces, initialLists }) {
    const { data: spaces = [] } = useSpacesQuery({ initialData: initialSpaces });
    const { data: lists = [] } = useListsQuery({ initialData: initialLists });

    const currentList = lists.find((list) => list.id === listId);
    const currentSpace = currentList
        ? spaces.find((space) => space.id === currentList.space_id)
        : null;

    if (!currentList) return null;

    return (
        <div className="mb-1">
            {currentSpace && <p className="text-xs text-muted-foreground">{currentSpace.name}</p>}
            <h1 className="text-lg font-semibold text-foreground">{currentList.name}</h1>
        </div>
    );
}
