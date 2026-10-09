'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import ModalShell from '@/components/custom/ModalShell';
import MountOnFirstOpen from '@/components/custom/MountOnFirstOpen';
import TagColorDot from '@/components/tag/TagColorDot';

const TAG_DISPLAY_MAX = 15;

/**
 * Shortens a tag name for row display, so one long tag can't disrupt the row's layout.
 *
 * @param {string} name - Full tag name
 * @returns {string} Name truncated to TAG_DISPLAY_MAX characters, with an ellipsis if it was cut
 */
function truncateTagName(name) {
    return name.length > TAG_DISPLAY_MAX ? `${name.slice(0, TAG_DISPLAY_MAX)}…` : name;
}

/**
 * Read-only tag summary for a task row: one pill per tag, or an "N tags" pill opening a list dialog.
 *
 * @param {object} props
 * @param {{id: string, name: string, color?: string}[]} [props.tags] - Tags on this task
 */
export default function TaskRowTags({ tags = [] }) {
    const [open, setOpen] = useState(false);

    if (tags.length === 0) return null;

    return (
        <>
            <button
                type="button"
                onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    setOpen(true);
                }}
                className="hit-area flex-shrink-0"
            >
                <Badge variant="tag">
                    {tags.length === 1 && <TagColorDot color={tags[0].color} />}
                    {tags.length === 1 ? truncateTagName(tags[0].name) : `${tags.length} tags`}
                </Badge>
            </button>
            <MountOnFirstOpen open={open}>
                <ModalShell open={open} onClose={() => setOpen(false)} title="Tags">
                    <div className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                            <Badge key={tag.id} variant="tag">
                                <TagColorDot color={tag.color} />
                                {tag.name}
                            </Badge>
                        ))}
                    </div>
                </ModalShell>
            </MountOnFirstOpen>
        </>
    );
}
