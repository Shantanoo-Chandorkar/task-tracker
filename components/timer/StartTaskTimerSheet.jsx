'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ModalShell from '@/components/custom/ModalShell';
import {
    Command,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandItem,
} from '@/components/ui/command';
import { Loader } from '@/components/custom/Loader';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTimeSessionsQuery } from '@/hooks/useTimeSessionsQuery';
import { useTimeSessionActions } from '@/hooks/useTimeSessionActions';
import { isLiveSession } from '@/modules/timer/domain/session-clock';
import { fetchJson } from '@/lib/fetch-json';

const SEARCH_STALE_TIME_MS = 30 * 1000;
const SEARCH_UNAVAILABLE_MESSAGE = 'Search is unavailable. Check your connection and try again.';

/**
 * Bottom sheet for picking a task to start a timer on - search reuses the same `/api/search`
 * endpoint the Cmd+K palette already calls, scoped here to its `tasks` results only.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the sheet is open.
 * @param {() => void} props.onClose - Called when the sheet should close.
 */
export default function StartTaskTimerSheet({ open, onClose }) {
    const isDesktop = useIsDesktop();
    const { start } = useTimeSessionActions();
    const { data: sessions = [] } = useTimeSessionsQuery();
    const [query, setQuery] = useState('');
    const [startingTaskId, setStartingTaskId] = useState(null);

    // Clears the search box on the next open, same shape GlobalSearch uses for its own query state.
    const [lastOpen, setLastOpen] = useState(open);
    if (open !== lastOpen) {
        setLastOpen(open);
        if (!open) setQuery('');
    }

    const trimmedQuery = query.trim();
    const debouncedQuery = useDebouncedValue(trimmedQuery, 250);

    const searchResultsQuery = useQuery({
        queryKey: ['search', debouncedQuery],
        queryFn: ({ signal }) =>
            fetchJson(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, { signal }),
        enabled: open && Boolean(debouncedQuery),
        staleTime: SEARCH_STALE_TIME_MS,
        retry: false,
    });

    const isLoading =
        Boolean(trimmedQuery) && (trimmedQuery !== debouncedQuery || searchResultsQuery.isPending);
    const hasFailed = Boolean(trimmedQuery) && !isLoading && searchResultsQuery.isError;
    const tasks =
        trimmedQuery && !isLoading && !hasFailed ? (searchResultsQuery.data?.tasks ?? []) : [];

    const liveTaskIds = new Set(
        sessions
            .filter(isLiveSession)
            .map((session) => session.task_id)
            .filter(Boolean),
    );

    async function handleSelect(taskId) {
        if (startingTaskId) return;
        setStartingTaskId(taskId);
        const didStart = await start({ taskId });
        setStartingTaskId(null);
        if (didStart) onClose();
    }

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={Boolean(startingTaskId)}
            variant="sheet"
            side={isDesktop ? 'right' : 'bottom'}
            title="Start a task timer"
            contentClassName={isDesktop ? 'sm:max-w-md' : undefined}
        >
            <Command shouldFilter={false} label="Search tasks" className="min-h-0">
                <CommandInput placeholder="Search tasks" value={query} onValueChange={setQuery} />
                <CommandList>
                    {tasks.length === 0 && isLoading && (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                            <Loader size="sm" />
                            Searching...
                        </div>
                    )}

                    {tasks.length === 0 && !isLoading && (
                        <CommandEmpty>
                            {hasFailed
                                ? SEARCH_UNAVAILABLE_MESSAGE
                                : trimmedQuery
                                  ? 'No tasks found.'
                                  : 'Type to search'}
                        </CommandEmpty>
                    )}

                    {tasks.map((task) => {
                        const isAlreadyLive = liveTaskIds.has(task.id);
                        return (
                            <CommandItem
                                key={task.id}
                                disabled={isAlreadyLive || Boolean(startingTaskId)}
                                onSelect={() => handleSelect(task.id)}
                            >
                                <span className="flex-1 truncate">{task.title}</span>
                                {isAlreadyLive ? (
                                    <span className="text-xs text-muted-foreground">
                                        Already tracking
                                    </span>
                                ) : (
                                    task.list_name && (
                                        <span className="text-xs text-muted-foreground">
                                            {task.list_name}
                                        </span>
                                    )
                                )}
                            </CommandItem>
                        );
                    })}
                </CommandList>
            </Command>
        </ModalShell>
    );
}
