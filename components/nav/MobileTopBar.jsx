'use client';

import { usePathname, useParams } from 'next/navigation';
import { useSpacesQuery } from '@/hooks/useSpacesQuery';
import { useListsQuery } from '@/hooks/useListsQuery';
import { Search } from 'lucide-react';
import MobileNavDrawer from './MobileNavDrawer';
import { openSearch } from './GlobalSearch';

/**
 * Mobile/tablet top bar shown below `lg` (1024px): hamburger drawer trigger,
 * centered current Space/List name, and a search button opening the global
 * search palette.
 *
 * @param {object} props
 * @param {object[]} [props.initialSpaces] - SSR-fetched spaces, so the title never hydration-mismatches
 * @param {object[]} [props.initialLists] - SSR-fetched lists, so the title never hydration-mismatches
 * @param {object|null} [props.initialProfile] - SSR-fetched profile, forwarded to the nav drawer
 */
export default function MobileTopBar({ initialSpaces, initialLists, initialProfile }) {
    const pathname = usePathname();
    const params = useParams();
    const listId = params?.listId;

    const { data: spaces = [] } = useSpacesQuery({
        enabled: Boolean(listId),
        initialData: initialSpaces,
    });
    const { data: lists = [] } = useListsQuery({
        enabled: Boolean(listId),
        initialData: initialLists,
    });

    const currentList = listId ? lists.find((list) => list.id === listId) : null;
    const currentSpace = currentList
        ? spaces.find((space) => space.id === currentList.space_id)
        : null;

    const staticTitle =
        pathname === '/'
            ? 'Home'
            : pathname.startsWith('/spaces')
              ? 'Spaces'
              : pathname.startsWith('/settings')
                ? 'Settings'
                : 'Task Tracker';

    return (
        <div className="lg:hidden sticky top-[var(--guest-banner-height,0px)] z-20 flex items-center justify-between gap-2 border-b border-border bg-background px-3 py-3">
            <MobileNavDrawer
                initialSpaces={initialSpaces}
                initialLists={initialLists}
                initialProfile={initialProfile}
            />

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
