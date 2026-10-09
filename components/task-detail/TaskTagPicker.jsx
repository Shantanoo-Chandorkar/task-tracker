'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { runExclusively } from '@/lib/in-flight-entities';
import { useTagsQuery } from '@/hooks/useTagsQuery';
import { assignTagsToTask, removeTagFromTask } from '@/actions/tag-actions';
import { usePermissionForSpace } from '@/hooks/usePermissionForSpace';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import TagComboboxField from '@/components/tag/TagComboboxField';

/**
 * Tag pills for a task, backed by the real `assignTagsToTask`/`removeTagFromTask` server actions.
 * Read-only collaborators only see the pills; other refusals come back from the server as a toast.
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
    const isReadOnly = usePermissionForSpace(spaceId) === 'read_only';

    const tags = (task.tags ?? []).map((tag) => ({
        key: tag.id,
        name: tag.name,
        color: tag.color,
    }));
    const suggestions = spaceTags.map((tag) => ({ key: tag.id, name: tag.name, color: tag.color }));

    async function refreshTags() {
        await queryClient.invalidateQueries({ queryKey: ['tasks', task.list_id] });
        await queryClient.invalidateQueries({ queryKey: ['tags', spaceId] });
        bustPageCache({ urls: [`/lists/${task.list_id}`] });
    }

    // One tag change per task at a time: a second one racing the first reload can lose a write.
    function runTagChange(work) {
        return runExclusively(`task-tag:${task.id}`, work, () =>
            toast.info('Still saving the last tag change'),
        );
    }

    function handleAdd(tagId) {
        return runTagChange(async () => {
            setPending(true);
            try {
                const assignResult = await assignTagsToTask({ taskId: task.id, tagIds: [tagId] });
                if (assignResult.error) {
                    toast.error(assignResult.error);
                    return;
                }
                await refreshTags();
            } catch {
                toast.error('Could not reach the server. Try again.');
            } finally {
                setPending(false);
            }
        });
    }

    function handleRemove(tagId) {
        return runTagChange(async () => {
            setRemovingKey(tagId);
            try {
                const removeResult = await removeTagFromTask({ taskId: task.id, tagId });
                if (removeResult.error) {
                    toast.error(removeResult.error);
                    return;
                }
                await refreshTags();
            } catch {
                toast.error('Could not reach the server. Try again.');
            } finally {
                setRemovingKey(null);
            }
        });
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
            isReadOnly={isReadOnly}
        />
    );
}
