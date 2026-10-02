'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ListChecks, LayoutGrid } from 'lucide-react';
import {
    CommandDialog,
    Command,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
} from '@/components/ui/command';
import { Loader } from '@/components/ui/loader';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { fetchJson } from '@/lib/fetch-json';

const listeners = new Set();
let isOpenState = false;

function getSnapshot() {
    return isOpenState;
}

function getServerSnapshot() {
    return false;
}

function subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

/** Opens the global search palette - called from the desktop sidebar and mobile top bar triggers. */
export function openSearch() {
    isOpenState = true;
    listeners.forEach((callback) => callback());
}

function closeSearch() {
    isOpenState = false;
    listeners.forEach((callback) => callback());
}

const EMPTY_RESULTS = { tasks: [], lists: [], spaces: [] };
const SEARCH_STALE_TIME_MS = 30 * 1000;
const SEARCH_UNAVAILABLE_MESSAGE = 'Search is unavailable. Check your connection and try again.';

/**
 * Global search palette - tasks, lists, and spaces, searched server-side via `/api/search`.
 */
export default function GlobalSearch() {
    const open = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const router = useRouter();
    const [query, setQuery] = useState('');
    const trimmedQuery = query.trim();
    const debouncedQuery = useDebouncedValue(trimmedQuery, 250);

    // Adjusted during render, not an effect - reacts to `open` changing, not an external system.
    const [lastOpen, setLastOpen] = useState(open);
    if (open !== lastOpen) {
        setLastOpen(open);
        if (!open) setQuery('');
    }

    useEffect(() => {
        function handleKeyDown(e) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                if (isOpenState) {
                    closeSearch();
                } else {
                    openSearch();
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Each keystroke's query key aborts the previous request, so a slow old answer can never replace a newer one.
    const searchResultsQuery = useQuery({
        queryKey: ['search', debouncedQuery],
        queryFn: ({ signal }) =>
            fetchJson(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, { signal }),
        enabled: open && Boolean(debouncedQuery),
        staleTime: SEARCH_STALE_TIME_MS,
        // Typing another character is the retry the user expects
        retry: false,
    });

    function handleSelect(href) {
        closeSearch();
        router.push(href);
    }

    // Covers the debounce gap too, not just the fetch, so results are never shown stale.
    const isLoading =
        Boolean(trimmedQuery) && (trimmedQuery !== debouncedQuery || searchResultsQuery.isPending);
    const hasFailed = Boolean(trimmedQuery) && !isLoading && searchResultsQuery.isError;
    const displayResults =
        trimmedQuery && !isLoading && !hasFailed
            ? (searchResultsQuery.data ?? EMPTY_RESULTS)
            : EMPTY_RESULTS;
    const hasResults =
        displayResults.tasks.length > 0 ||
        displayResults.lists.length > 0 ||
        displayResults.spaces.length > 0;

    const resultCount =
        displayResults.tasks.length + displayResults.lists.length + displayResults.spaces.length;
    // Screen-reader twin of the visible result list, spoken once per change
    const statusMessage = !trimmedQuery
        ? ''
        : isLoading
          ? 'Searching'
          : hasFailed
            ? SEARCH_UNAVAILABLE_MESSAGE
            : hasResults
              ? `${resultCount} ${resultCount === 1 ? 'result' : 'results'}`
              : 'No results';

    return (
        <CommandDialog
            open={open}
            onOpenChange={(next) => (next ? openSearch() : closeSearch())}
            title="Search"
            description="Search tasks, lists, and spaces"
        >
            {/* cmdk names the input from this label; an aria-label on the input is ignored */}
            <Command shouldFilter={false} label="Search tasks, lists, spaces">
                <CommandInput
                    placeholder="Search tasks, lists, spaces"
                    value={query}
                    onValueChange={setQuery}
                />
                <div role="status" className="sr-only">
                    {statusMessage}
                </div>
                <CommandList>
                    {!hasResults && isLoading && (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                            <Loader size="sm" />
                            Searching...
                        </div>
                    )}

                    {!hasResults && !isLoading && (
                        <CommandEmpty>
                            {hasFailed
                                ? SEARCH_UNAVAILABLE_MESSAGE
                                : trimmedQuery
                                  ? 'No results.'
                                  : 'Type to search'}
                        </CommandEmpty>
                    )}

                    {displayResults.tasks.length > 0 && (
                        <CommandGroup heading="Tasks">
                            {displayResults.tasks.map((task) => (
                                <CommandItem
                                    key={task.id}
                                    onSelect={() =>
                                        handleSelect(`/lists/${task.list_id}/tasks/${task.id}`)
                                    }
                                >
                                    <ListChecks className="h-4 w-4" />
                                    <span className="flex-1 truncate">{task.title}</span>
                                    {task.list_name && (
                                        <span className="text-xs text-muted-foreground">
                                            {task.list_name}
                                        </span>
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}

                    {displayResults.lists.length > 0 && (
                        <CommandGroup heading="Lists">
                            {displayResults.lists.map((list) => (
                                <CommandItem
                                    key={list.id}
                                    onSelect={() => handleSelect(`/lists/${list.id}`)}
                                >
                                    <LayoutGrid className="h-4 w-4" />
                                    <span className="truncate">{list.name}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}

                    {displayResults.spaces.length > 0 && (
                        <CommandGroup heading="Spaces">
                            {displayResults.spaces.map((space) => (
                                <CommandItem
                                    key={space.id}
                                    onSelect={() => handleSelect('/spaces')}
                                >
                                    <LayoutGrid className="h-4 w-4" />
                                    <span className="truncate">{space.name}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                </CommandList>
            </Command>
        </CommandDialog>
    );
}
