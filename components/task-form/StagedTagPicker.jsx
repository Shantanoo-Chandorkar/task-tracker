'use client';

import { useTagsQuery } from '@/hooks/useTagsQuery';
import TagComboboxField from '@/components/tag/TagComboboxField';

/**
 * Tag picker for a task with no id yet - holds the chosen tag ids locally, attached in one submit with the task.
 *
 * @param {object} props
 * @param {string|null} props.spaceId - Space the new task will belong to, whose tags can be picked
 * @param {string[]} props.tagIds - Ids of the tags chosen so far
 * @param {(tagIds: string[]) => void} props.onChange - Called with the updated list of tag ids
 */
export default function StagedTagPicker({ spaceId, tagIds, onChange }) {
    const { data: spaceTags = [] } = useTagsQuery(spaceId);

    const suggestions = spaceTags.map((tag) => ({ key: tag.id, name: tag.name, color: tag.color }));
    // A tag deleted since it was picked simply drops out of the pills
    const tags = suggestions.filter((tag) => tagIds.includes(tag.key));

    return (
        <TagComboboxField
            tags={tags}
            suggestions={suggestions}
            onAdd={(tagId) => onChange([...tagIds, tagId])}
            onRemove={(tagId) => onChange(tagIds.filter((chosenId) => chosenId !== tagId))}
            isFieldSized
        />
    );
}
