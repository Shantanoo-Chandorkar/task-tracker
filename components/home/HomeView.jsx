'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LayoutGrid, ListChecks, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import { openSearch } from '@/components/nav/GlobalSearch';
import { useHomeQuery } from '@/hooks/useHomeQuery';
import HomeTaskSection from './HomeTaskSection';
import HomeLinkSection from './HomeLinkSection';

/**
 * Home screen: quick actions plus priority tasks, recent tasks, recent lists and recent sublists.
 *
 * @param {object} props
 * @param {object} [props.initialHome] - Summary loaded on the server; the client fetches it when missing.
 * @param {{ id: string, name: string }} props.firstList - Target for "New task" when no list has recent activity.
 * @returns {JSX.Element}
 */
export default function HomeView({ initialHome, firstList }) {
    const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
    const {
        data: homeSummary,
        isPending,
        isError,
        refetch,
        isFetching,
    } = useHomeQuery({ initialData: initialHome });

    const newTaskTargetList = homeSummary?.recentLists[0] ?? firstList;

    const recentListLinks = (homeSummary?.recentLists ?? []).map((list) => ({
        id: list.id,
        href: `/lists/${list.id}`,
        name: list.name,
        color: list.color,
        subtitle: `${list.task_count} ${list.task_count === 1 ? 'task' : 'tasks'}`,
    }));
    const recentSublistLinks = (homeSummary?.recentSublists ?? []).map((sublist) => ({
        id: sublist.id,
        href: `/lists/${sublist.list_id}`,
        name: sublist.name,
        color: sublist.color,
        subtitle: sublist.list_name ?? '',
    }));

    return (
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6">
            <div className="mb-6">
                <h1 className="text-xl font-semibold text-foreground">Home</h1>
                <p className="text-sm text-muted-foreground mt-1">Pick up where you left off.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-8">
                <Button
                    type="button"
                    variant="outline"
                    className="h-11 justify-start gap-2"
                    onClick={() => setIsNewTaskOpen(true)}
                    disabled={!newTaskTargetList}
                >
                    <ListChecks className="h-4 w-4" />
                    <span className="truncate">New task</span>
                </Button>
                <Button asChild variant="outline" className="h-11 justify-start gap-2">
                    <Link href="/spaces">
                        <LayoutGrid className="h-4 w-4" />
                        Spaces
                    </Link>
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className="h-11 justify-start gap-2"
                    onClick={openSearch}
                >
                    <Search className="h-4 w-4" />
                    Search
                    <kbd className="ml-auto hidden text-xs text-muted-foreground sm:inline">
                        Ctrl K
                    </kbd>
                </Button>
            </div>

            {isPending && (
                <div className="flex justify-center py-12">
                    <Loader size="sm" />
                </div>
            )}

            {isError && !homeSummary && (
                <div className="rounded-md border border-border px-4 py-8 text-center">
                    <p className="text-sm text-foreground mb-1">Could not load your home screen.</p>
                    <p className="text-sm text-muted-foreground mb-4">
                        Check your connection and try again.
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => refetch()}
                        disabled={isFetching}
                    >
                        Try again
                    </Button>
                </div>
            )}

            {homeSummary && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-8 min-w-0">
                        <HomeTaskSection
                            title="Priority"
                            tasks={homeSummary.priorityTasks}
                            emptyMessage="Star a task to pin it here."
                            showsPriorityStar
                        />
                        <HomeTaskSection
                            title="Recent tasks"
                            tasks={homeSummary.recentTasks}
                            emptyMessage="Tasks you change will show up here."
                        />
                    </div>
                    <div className="space-y-8 min-w-0">
                        <HomeLinkSection
                            title="Recent lists"
                            links={recentListLinks}
                            emptyMessage="Lists you work in will show up here."
                        />
                        <HomeLinkSection
                            title="Recent sublists"
                            links={recentSublistLinks}
                            emptyMessage="Sublists you work in will show up here."
                        />
                    </div>
                </div>
            )}

            {newTaskTargetList && (
                <TaskFormDialog
                    open={isNewTaskOpen}
                    onClose={() => setIsNewTaskOpen(false)}
                    listId={newTaskTargetList.id}
                />
            )}
        </div>
    );
}
