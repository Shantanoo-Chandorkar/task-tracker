'use client';

import { useSpacesQuery } from '@/hooks/useSpacesQuery';
import { useListsQuery } from '@/hooks/useListsQuery';
import ExportMenu from '@/components/export/ExportMenu';

/**
 * Space + List name header above the status tiles - reads the shared `['spaces']`/`['lists']` cache.
 * `initialSpaces`/`initialLists` seed that cache from SSR to avoid a hydration mismatch.
 *
 * @param {object} props
 * @param {string} props.listId - The list currently being viewed
 * @param {object[]} [props.initialSpaces] - SSR-fetched spaces, hydrates the `['spaces']` query
 * @param {object[]} [props.initialLists] - SSR-fetched lists, hydrates the `['lists']` query
 */
export default function ListHeader({ listId, initialSpaces, initialLists, children }) {
    const { data: spaces = [] } = useSpacesQuery({ initialData: initialSpaces });
    const { data: lists = [] } = useListsQuery({ initialData: initialLists });

    const currentList = lists.find((list) => list.id === listId);
    const currentSpace = currentList
        ? spaces.find((space) => space.id === currentList.space_id)
        : null;

    if (!currentList) return null;

    return (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
                {currentSpace && <p className="text-xs text-muted-foreground">{currentSpace.name}</p>}
                <div className="mt-1 flex items-center gap-2">
                    <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: currentList.color || 'var(--primary)' }}
                    />
                    <h1 className="text-lg font-semibold text-foreground">{currentList.name}</h1>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {currentList.task_count ?? 0} tasks
                    </span>
                    <ExportMenu scope={{ type: 'list', id: listId }} />
                </div>
            </div>
            {children && <div>{children}</div>}
        </div>
    );
}
