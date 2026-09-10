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
 * Global search palette — tasks, lists, and spaces, searched server-side via
 * `/api/search`. Mounted once at the root layout; opened from anywhere via
 * `openSearch()` (used by the desktop sidebar and mobile top bar's search
 * buttons) or the `Cmd/Ctrl+K` shortcut bound here.
 */
export default function GlobalSearch() {
    const open = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(EMPTY_RESULTS);

    // Reset the query when the palette closes, so reopening starts fresh —
    // adjusted during render (same pattern as TaskFormDialog's resetKey)
    // instead of an effect, since this is a synchronous response to `open`
    // changing, not a subscription to an external system.
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

    // Debounced server search — a genuine external-system sync (network
    // fetch on a timer), so `setResults` only ever fires inside the async
    // callback, never synchronously in the effect body.
    useEffect(() => {
        if (!open || !query.trim()) return;
        const trimmed = query.trim();

        const timeoutId = setTimeout(async () => {
            const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
            if (response.ok) setResults(await response.json());
        }, 250);

        return () => clearTimeout(timeoutId);
    }, [query, open]);

    function handleSelect(href) {
        closeSearch();
        router.push(href);
    }

    // An empty query displays no results even if stale results from a
    // previous search are still in state (cleared for real once the palette
    // closes and reopens) — avoids a synchronous setState just to blank it.
    const displayResults = query.trim() ? results : EMPTY_RESULTS;
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
                    placeholder="Search tasks, lists, spaces..."
                    value={query}
                    onValueChange={setQuery}
                />
                <CommandList>
                    {!hasResults && (
                        <CommandEmpty>
                            {query.trim() ? 'No results.' : 'Type to search...'}
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
