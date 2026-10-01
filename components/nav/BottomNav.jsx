'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useSpacesQuery } from '@/hooks/useSpacesQuery';
import { useListsQuery } from '@/hooks/useListsQuery';
import { Home, ListChecks, LayoutGrid, Settings } from 'lucide-react';
import QuickCreateFab from './QuickCreateFab';

/**
 * Mobile bottom navigation - Home / Tasks / Spaces / Settings, with a center-FAB quick-create.
 *
 * @param {object} props
 * @param {object[]} [props.initialSpaces] - SSR-fetched spaces, so the Tasks link's href never hydration-mismatches
 * @param {object[]} [props.initialLists] - SSR-fetched lists, so the Tasks link's href never hydration-mismatches
 */
export default function BottomNav({ initialSpaces, initialLists }) {
    const pathname = usePathname();
    const params = useParams();
    const listId = params?.listId;

    const { data: spaces } = useSpacesQuery({ initialData: initialSpaces });
    const { data: lists } = useListsQuery({ initialData: initialLists });

    const firstSpaceWithList = (spaces || []).find((space) =>
        (lists || []).some((list) => list.space_id === space.id),
    );
    const firstListId = firstSpaceWithList
        ? lists.find((list) => list.space_id === firstSpaceWithList.id)?.id
        : undefined;

    const tasksHref = listId ? `/lists/${listId}` : firstListId ? `/lists/${firstListId}` : '/';

    const isHome = pathname === '/';
    const isTasks = pathname.startsWith('/lists');
    const isSpaces = pathname.startsWith('/spaces');
    const isSettings = pathname.startsWith('/settings');

    return (
        // Spacer matches the FAB's width so it centers at true 50%, not an uneven flex gap.
        <nav className="lg:hidden translucent-bar fixed bottom-0 inset-x-0 z-20 border-t pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
            <div className="relative flex items-center">
                <div className="flex-1 flex">
                    <Link
                        href="/"
                        className={`press-feedback flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isHome ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                        <Home className="h-5 w-5" />
                        Home
                    </Link>

                    <Link
                        href={tasksHref}
                        className={`press-feedback flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isTasks ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                        <ListChecks className="h-5 w-5" />
                        Tasks
                    </Link>
                </div>

                <div className="w-12 flex-shrink-0" aria-hidden="true" />

                <div className="flex-1 flex">
                    <Link
                        href="/spaces"
                        className={`press-feedback flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isSpaces ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                        <LayoutGrid className="h-5 w-5" />
                        Spaces
                    </Link>

                    <Link
                        href="/settings"
                        className={`press-feedback flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isSettings ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                        <Settings className="h-5 w-5" />
                        Settings
                    </Link>
                </div>

                <QuickCreateFab className="press-feedback absolute left-1/2 -top-4 -translate-x-1/2 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center" />
            </div>
        </nav>
    );
}
