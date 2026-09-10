'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Small header above the status tiles: muted Space name + bold List name,
 * matching the artifact's desktop `.desktop-header`. Reads from the same
 * `['spaces']`/`['lists']` query cache the sidebar already populates — no
 * new fetch.
 *
 * `initialSpaces`/`initialLists` seed the query cache from the server-rendered
 * list page. Without them the server always has no data for these two queries
 * (they're never SSR'd elsewhere on this route) while the client can resolve
 * them before hydration finishes, which throws a hydration mismatch — same
 * `initialData` pattern `TaskList` already uses for tasks/statuses.
 *
 * @param {object} props
 * @param {string} props.listId - The list currently being viewed
 * @param {object[]} [props.initialSpaces] - SSR-fetched spaces, hydrates the `['spaces']` query
 * @param {object[]} [props.initialLists] - SSR-fetched lists, hydrates the `['lists']` query
 */
export default function ListHeader({ listId, initialSpaces, initialLists }) {
    const { data: spaces = [] } = useQuery({
        queryKey: ['spaces'],
        queryFn: async () => {
            const response = await fetch('/api/spaces');
            if (!response.ok) throw new Error('Failed to fetch spaces');
            return response.json();
        },
        initialData: initialSpaces,
    });

    const { data: lists = [] } = useQuery({
        queryKey: ['lists'],
        queryFn: async () => {
            const response = await fetch('/api/lists');
            if (!response.ok) throw new Error('Failed to fetch lists');
            return response.json();
        },
        initialData: initialLists,
    });

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
