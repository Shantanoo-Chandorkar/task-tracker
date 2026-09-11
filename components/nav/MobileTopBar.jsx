'use client';

import { usePathname, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import MobileNavDrawer from './MobileNavDrawer';
import { openSearch } from './GlobalSearch';

/**
 * Mobile/tablet top bar shown below `lg` (1024px): hamburger drawer trigger,
 * centered current Space/List name, and a search button opening the global
 * search palette.
 */
export default function MobileTopBar() {
    const pathname = usePathname();
    const params = useParams();
    const listId = params?.listId;

    const { data: spaces = [] } = useQuery({
        queryKey: ['spaces'],
        queryFn: async () => {
            const response = await fetch('/api/spaces');
            if (!response.ok) throw new Error('Failed to fetch spaces');
            return response.json();
        },
        enabled: Boolean(listId),
    });

    const { data: lists = [] } = useQuery({
        queryKey: ['lists'],
        queryFn: async () => {
            const response = await fetch('/api/lists');
            if (!response.ok) throw new Error('Failed to fetch lists');
            return response.json();
        },
        enabled: Boolean(listId),
    });

    const currentList = listId ? lists.find((list) => list.id === listId) : null;
    const currentSpace = currentList
        ? spaces.find((space) => space.id === currentList.space_id)
        : null;

    const staticTitle = pathname.startsWith('/spaces')
        ? 'Spaces'
        : pathname.startsWith('/settings')
          ? 'Settings'
          : 'Task Tracker';

    return (
        <div className="lg:hidden sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-background px-3 py-2.5">
            <MobileNavDrawer />

            <div className="flex-1 text-center leading-tight">
                {currentList ? (
                    <>
                        {currentSpace && (
                            <div className="text-[11px] text-muted-foreground truncate">
                                {currentSpace.name}
                            </div>
                        )}
                        <div className="text-sm font-semibold text-foreground truncate">
                            {currentList.name}
                        </div>
                    </>
                ) : (
                    <div className="text-sm font-semibold text-foreground truncate">
                        {staticTitle}
                    </div>
                )}
            </div>

            <button
                onClick={openSearch}
                aria-label="Search"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            >
                <Search className="h-4.5 w-4.5" />
            </button>
        </div>
    );
}
