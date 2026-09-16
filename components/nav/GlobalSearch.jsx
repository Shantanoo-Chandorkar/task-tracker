'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
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

/** Opens the global search palette — called from the desktop sidebar and mobile top bar triggers. */
export function openSearch() {
    isOpenState = true;
    listeners.forEach((callback) => callback());
}

function closeSearch() {
    isOpenState = false;
    listeners.forEach((callback) => callback());
}

const EMPTY_RESULTS = { tasks: [], lists: [], spaces: [] };

/**
 * Global search palette — tasks, lists, and spaces, searched server-side via `/api/search`.
 */
export default function GlobalSearch() {
    const open = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(EMPTY_RESULTS);
    const [completedQuery, setCompletedQuery] = useState(null);
    const trimmedQuery = query.trim();
    const debouncedQuery = useDebouncedValue(trimmedQuery, 250);

    // Adjusted during render, not an effect — reacts to `open` changing, not an external system.
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

    // `cancelled` guards against a slower earlier response landing after a later one.
    useEffect(() => {
        if (!open || !debouncedQuery) return;

        let cancelled = false;

        fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
            .then((response) => (response.ok ? response.json() : EMPTY_RESULTS))
            .catch(() => EMPTY_RESULTS)
            .then((data) => {
                if (cancelled) return;
                setResults(data);
                setCompletedQuery(debouncedQuery);
            });

        return () => {
            cancelled = true;
        };
    }, [debouncedQuery, open]);

    function handleSelect(href) {
        closeSearch();
        router.push(href);
    }

    // Covers the debounce gap too, not just the fetch, so results are never shown stale.
    const isLoading =
        Boolean(trimmedQuery) && (trimmedQuery !== debouncedQuery || debouncedQuery !== completedQuery);
    const displayResults = trimmedQuery && !isLoading ? results : EMPTY_RESULTS;
    const hasResults =
        displayResults.tasks.length > 0 ||
        displayResults.lists.length > 0 ||
        displayResults.spaces.length > 0;

    return (
        <CommandDialog
            open={open}
            onOpenChange={(next) => (next ? openSearch() : closeSearch())}
            title="Search"
            description="Search tasks, lists, and spaces"
        >
            <Command shouldFilter={false}>
                <CommandInput
                    placeholder="Search tasks, lists, spaces"
                    value={query}
                    onValueChange={setQuery}
                />
                <CommandList>
                    {!hasResults && isLoading && (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                            <Loader size="sm" />
                            Searching...
                        </div>
                    )}

                    {!hasResults && !isLoading && (
                        <CommandEmpty>
                            {trimmedQuery ? 'No results.' : 'Type to search'}
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
