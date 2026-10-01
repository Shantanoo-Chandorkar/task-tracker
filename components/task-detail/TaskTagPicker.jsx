'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTagsQuery } from '@/hooks/useTagsQuery';
import { addTagToTask, removeTagFromTask } from '@/actions/tag-actions';
import { bustPageCache } from '@/lib/service-worker-cache';
import TagComboboxField from '@/components/tag/TagComboboxField';

/**
 * Tag pills for a task, backed by the real `addTagToTask`/`removeTagFromTask` server actions.
 * No permission gating - this page relies on the server rejection toast for every action already.
 *
 * @param {object} props
 * @param {object} props.task - Task whose tags are shown/edited (uses id, list_id, tags)
 * @param {string|null} props.spaceId - Space the task's list belongs to, for the tag suggestion list
 * @param {boolean} [props.isFieldSized] - Passed through to size pills like a form select
 */
export default function TaskTagPicker({ task, spaceId, isFieldSized = false }) {
    const queryClient = useQueryClient();
    const [pending, setPending] = useState(false);
    const [removingKey, setRemovingKey] = useState(null);
    const { data: spaceTags = [] } = useTagsQuery(spaceId);

    const tags = (task.tags ?? []).map((tag) => ({ key: tag.id, name: tag.name }));
    const suggestions = spaceTags.map((tag) => ({ key: tag.id, name: tag.name }));

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
            await refreshTags();
        } catch {
            toast.error('Could not reach the server. Try again.');
        } finally {
            setPending(false);
        }
    }

    async function handleRemove(tagId) {
        setRemovingKey(tagId);
        try {
            const result = await removeTagFromTask({ taskId: task.id, tagId });
            if (result.error) {
                toast.error(result.error);
                return;
            }
            await refreshTags();
        } catch {
            toast.error('Could not reach the server. Try again.');
        } finally {
            setRemovingKey(null);
        }
    }

    return (
        <TagComboboxField
            tags={tags}
            suggestions={suggestions}
            onAdd={handleAdd}
            onRemove={handleRemove}
            addPending={pending}
            removingKey={removingKey}
            isFieldSized={isFieldSized}
        />
    );
}
