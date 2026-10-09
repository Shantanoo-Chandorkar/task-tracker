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
import { Loader } from '@/components/custom/Loader';
import { LABEL_NAME_MAX } from '@/lib/space-labels/label-limits';
import { MAX_TAGS_PER_TASK } from '@/lib/tags/tag-limits';
import TagColorDot from './TagColorDot';

/**
 * Tag pills with a popover to pick one of the space's existing tags. Tags are made in the space settings.
 * Presentational only - callers decide what add/remove actually do (server call vs local list).
 *
 * @param {object} props
 * @param {{key: string, name: string, color?: string}[]} props.tags - Currently attached tags, rendered as badges
 * @param {{key: string, name: string, color?: string}[]} props.suggestions - Every tag of the space to pick from
 * @param {(tagKey: string) => void} props.onAdd - Called with the key of the picked tag
 * @param {(tagKey: string) => void} props.onRemove - Called with the attached tag's key to detach
 * @param {boolean} [props.addPending] - Disables the trigger while an add is in flight
 * @param {string|null} [props.removingKey] - Key of the tag currently being removed, if any
 * @param {boolean} [props.isFieldSized] - Sizes pills like a form select (h-8) so they line up beside one
 * @param {boolean} [props.isReadOnly] - Shows the pills only, with no way to add or remove
 */
export default function TagComboboxField({
    tags,
    suggestions,
    onAdd,
    onRemove,
    addPending,
    removingKey,
    isFieldSized = false,
    isReadOnly = false,
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const attachedKeys = new Set(tags.map((tag) => tag.key));
    const lowerQuery = query.trim().toLowerCase();
    const matchingSuggestions = suggestions.filter(
        (tag) => !attachedKeys.has(tag.key) && tag.name.toLowerCase().includes(lowerQuery),
    );
    const isFull = tags.length >= MAX_TAGS_PER_TASK;

    function handleAdd(tagKey) {
        onAdd(tagKey);
        setQuery('');
        setOpen(false);
    }

    const badgeSizeClass = isFieldSized ? 'h-8 rounded-lg pl-2.5 text-sm' : '';
    const addButtonSizeClass = isFieldSized
        ? 'h-8 rounded-lg px-2.5 text-sm'
        : 'rounded-full px-2 py-0.5 text-xs';

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
                <Badge
                    key={tag.key}
                    variant="tag"
                    className={`max-w-full gap-1 ${isReadOnly ? '' : 'pr-1'} ${badgeSizeClass}`}
                >
                    <TagColorDot color={tag.color} />
                    <span className="min-w-0 truncate">{tag.name}</span>
                    {!isReadOnly && (
                        <button
                            type="button"
                            onClick={() => onRemove(tag.key)}
                            disabled={tag.key === removingKey}
                            aria-label={`Remove tag ${tag.name}`}
                            className="rounded-full p-0.5 hover:bg-foreground/10"
                        >
                            {tag.key === removingKey ? (
                                <Loader size="xs" />
                            ) : (
                                <X className="h-3 w-3" />
                            )}
                        </button>
                    )}
                </Badge>
            ))}

            {!isReadOnly && (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            disabled={addPending || isFull}
                            title={
                                isFull
                                    ? `A task can have at most ${MAX_TAGS_PER_TASK} tags`
                                    : undefined
                            }
                            className={`flex items-center gap-1 border border-dashed border-field text-muted-foreground dark:bg-input/30 hover:text-foreground hover:border-foreground/40 disabled:opacity-50 ${addButtonSizeClass}`}
                        >
                            {addPending ? <Loader size="xs" /> : <Plus className="h-3 w-3" />}
                            Tag
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-56 p-0">
                        <Command shouldFilter={false}>
                            <CommandInput
                                value={query}
                                onValueChange={setQuery}
                                placeholder="Find a tag"
                                maxLength={LABEL_NAME_MAX}
                            />
                            <CommandList>
                                <CommandEmpty>
                                    {suggestions.length === 0
                                        ? 'No tags yet. Add them in the space settings.'
                                        : 'No matching tags'}
                                </CommandEmpty>
                                <CommandGroup>
                                    {matchingSuggestions.map((tag) => (
                                        <CommandItem
                                            key={tag.key}
                                            onSelect={() => handleAdd(tag.key)}
                                            className="gap-2"
                                        >
                                            <TagColorDot color={tag.color} />
                                            <span className="min-w-0 truncate">{tag.name}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
