'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';

const TAG_NAME_MAX = 50;

/**
 * Tag pills with a popover combobox to attach existing tags or create new ones by name.
 * Presentational only - callers decide what add/remove actually do (server call vs local array).
 *
 * @param {object} props
 * @param {{key: string, name: string}[]} props.tags - Currently attached tags, rendered as badges
 * @param {{key: string, name: string}[]} props.suggestions - Candidate tags to search/pick from
 * @param {Function} props.onAdd - Called with a tag name to attach (existing or new)
 * @param {Function} props.onRemove - Called with the attached tag's key to detach
 * @param {boolean} [props.addPending] - Disables the trigger while an add is in flight
 */
export default function TagComboboxField({ tags, suggestions, onAdd, onRemove, addPending }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const attachedNames = new Set(tags.map((tag) => tag.name.toLowerCase()));
    const trimmedQuery = query.trim();
    const matchingSuggestions = suggestions.filter(
        (tag) =>
            !attachedNames.has(tag.name.toLowerCase()) &&
            tag.name.toLowerCase().includes(trimmedQuery.toLowerCase()),
    );
    const hasExactMatch = matchingSuggestions.some(
        (tag) => tag.name.toLowerCase() === trimmedQuery.toLowerCase(),
    );

    function handleAdd(name) {
        onAdd(name);
        setQuery('');
        setOpen(false);
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
                <Badge key={tag.key} variant="secondary" className="gap-1 pr-1">
                    {tag.name}
                    <button
                        type="button"
                        onClick={() => onRemove(tag.key)}
                        aria-label={`Remove tag ${tag.name}`}
                        className="rounded-full p-0.5 hover:bg-foreground/10"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </Badge>
            ))}

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        disabled={addPending}
                        className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40"
                    >
                        <Plus className="h-3 w-3" />
                        Tag
                    </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-0">
                    <Command shouldFilter={false}>
                        <CommandInput
                            value={query}
                            onValueChange={setQuery}
                            placeholder="Find or create a tag"
                            maxLength={TAG_NAME_MAX}
                        />
                        <CommandList>
                            <CommandEmpty>
                                {trimmedQuery ? 'No matching tags' : 'Type to search or create'}
                            </CommandEmpty>
                            <CommandGroup>
                                {matchingSuggestions.map((tag) => (
                                    <CommandItem key={tag.key} onSelect={() => handleAdd(tag.name)}>
                                        {tag.name}
                                    </CommandItem>
                                ))}
                                {trimmedQuery && !hasExactMatch && (
                                    <CommandItem onSelect={() => handleAdd(trimmedQuery)}>
                                        Create &quot;{trimmedQuery}&quot;
                                    </CommandItem>
                                )}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}
