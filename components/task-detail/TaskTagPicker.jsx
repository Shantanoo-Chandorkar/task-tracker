'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
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
import { useTagsQuery } from '@/hooks/useTagsQuery';
import { addTagToTask, removeTagFromTask } from '@/actions/tag-actions';
import { bustPageCache } from '@/lib/service-worker-cache';

const TAG_NAME_MAX = 50;

/**
 * Tag pills for a task, with a popover combobox to attach existing space tags or create new ones.
 * No permission gating - this page relies on the server rejection toast for every action already.
 *
 * @param {object} props
 * @param {object} props.task - Task whose tags are shown/edited (uses id, list_id, tags)
 * @param {string|null} props.spaceId - Space the task's list belongs to, for the tag suggestion list
 */
export default function TaskTagPicker({ task, spaceId }) {
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [pending, setPending] = useState(false);
    const { data: spaceTags = [] } = useTagsQuery(spaceId);

    const taskTags = task.tags ?? [];
    const taskTagIds = new Set(taskTags.map((tag) => tag.id));
    const trimmedQuery = query.trim();
    const suggestions = spaceTags.filter(
        (tag) =>
            !taskTagIds.has(tag.id) && tag.name.toLowerCase().includes(trimmedQuery.toLowerCase()),
    );
    const hasExactMatch = suggestions.some(
        (tag) => tag.name.toLowerCase() === trimmedQuery.toLowerCase(),
    );

    async function refreshTags() {
        await queryClient.invalidateQueries({ queryKey: ['tasks', task.list_id] });
        await queryClient.invalidateQueries({ queryKey: ['tags', spaceId] });
        bustPageCache({ urls: [`/lists/${task.list_id}`] });
    }

    async function handleAdd(name) {
        setPending(true);
        try {
            const result = await addTagToTask({ taskId: task.id, name });
            if (result.error) {
                toast.error(result.error);
                return;
            }
            setQuery('');
            setOpen(false);
            await refreshTags();
        } catch {
            toast.error('Could not reach the server. Try again.');
        } finally {
            setPending(false);
        }
    }

    async function handleRemove(tagId) {
        try {
            const result = await removeTagFromTask({ taskId: task.id, tagId });
            if (result.error) {
                toast.error(result.error);
                return;
            }
            await refreshTags();
        } catch {
            toast.error('Could not reach the server. Try again.');
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {taskTags.map((tag) => (
                <Badge key={tag.id} variant="secondary" className="gap-1 pr-1">
                    {tag.name}
                    <button
                        type="button"
                        onClick={() => handleRemove(tag.id)}
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
                        disabled={pending}
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
                                {suggestions.map((tag) => (
                                    <CommandItem key={tag.id} onSelect={() => handleAdd(tag.name)}>
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
