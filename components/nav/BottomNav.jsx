'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useSpacesQuery } from '@/hooks/useSpacesQuery';
import { useListsQuery } from '@/hooks/useListsQuery';
import { ListChecks, LayoutGrid, Settings } from 'lucide-react';
import QuickCreateFab from './QuickCreateFab';

/**
 * Mobile bottom navigation — Tasks / Spaces / Settings, with a center-FAB quick-create.
 */
export default function BottomNav() {
    const pathname = usePathname();
    const params = useParams();
    const listId = params?.listId;

    const { data: spaces } = useSpacesQuery();
    const { data: lists } = useListsQuery();

    const firstSpaceWithList = (spaces || []).find((space) =>
        (lists || []).some((list) => list.space_id === space.id),
    );
    const firstListId = firstSpaceWithList
        ? lists.find((list) => list.space_id === firstSpaceWithList.id)?.id
        : undefined;

    const tasksHref = listId ? `/lists/${listId}` : firstListId ? `/lists/${firstListId}` : '/';

    const isTasks = pathname.startsWith('/lists');
    const isSpaces = pathname.startsWith('/spaces');
    const isSettings = pathname.startsWith('/settings');

    return (
        // Spacer matches the FAB's width so it centers at true 50%, not an uneven flex gap.
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
            <div className="relative flex items-center">
                <div className="flex-1 flex">
                    <Link
                        href={tasksHref}
                        className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isTasks ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                        <ListChecks className="h-5 w-5" />
                        Tasks
                    </Link>
                </div>

                <div className="w-12 flex-shrink-0" aria-hidden="true" />

                <div className="flex-1 flex">
                    <Link
                        href="/spaces"
                        className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isSpaces ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                        <LayoutGrid className="h-5 w-5" />
                        Spaces
                    </Link>

                    <Link
                        href="/settings"
                        className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isSettings ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                        <Settings className="h-5 w-5" />
                        Settings
                    </Link>
                </div>

                <QuickCreateFab className="absolute left-1/2 -top-4 -translate-x-1/2 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center" />
            </div>
        </nav>
    );
}
