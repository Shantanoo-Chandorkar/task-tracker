'use client';

import { useTagsQuery } from '@/hooks/useTagsQuery';
import TagComboboxField from '@/components/tag/TagComboboxField';

/**
 * Tag picker for a task with no id yet - holds names locally, attached in one submit with the task.
 *
 * @param {object} props
 * @param {string|null} props.spaceId - Space the new task will belong to, for the tag suggestion list
 * @param {string[]} props.tagNames - Currently staged tag names
 * @param {Function} props.onChange - Called with the updated tag name array
 */
export default function StagedTagPicker({ spaceId, tagNames, onChange }) {
    const { data: spaceTags = [] } = useTagsQuery(spaceId);

    const tags = tagNames.map((name) => ({ key: name, name }));
    const suggestions = spaceTags.map((tag) => ({ key: tag.id, name: tag.name }));

    function handleAdd(name) {
        const alreadyStaged = tagNames.some(
            (existingName) => existingName.toLowerCase() === name.toLowerCase(),
        );
        if (alreadyStaged) return;
        onChange([...tagNames, name]);
    }

    function handleRemove(name) {
        onChange(tagNames.filter((existingName) => existingName !== name));
    }

    return (
        <TagComboboxField
            tags={tags}
            suggestions={suggestions}
            onAdd={handleAdd}
            onRemove={handleRemove}
            isFieldSized
        />
    );
}
