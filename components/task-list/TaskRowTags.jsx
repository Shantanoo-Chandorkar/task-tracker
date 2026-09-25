'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import ModalShell from '@/components/ui/modal-shell';

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
 * @param {{id: string, name: string}[]} [props.tags] - Tags on this task
 */
export default function TaskRowTags({ tags = [] }) {
    const [open, setOpen] = useState(false);

    if (tags.length === 0) return null;

    if (tags.length === 1) {
        return (
            <Badge variant="secondary" className="flex-shrink-0">
                {truncateTagName(tags[0].name)}
            </Badge>
        );
    }

    return (
        <>
            <button
                type="button"
                onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    setOpen(true);
                }}
                className="flex-shrink-0"
            >
                <Badge variant="secondary">{tags.length} tags</Badge>
            </button>
            <ModalShell open={open} onClose={() => setOpen(false)} title="Tags">
                <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                        <Badge key={tag.id} variant="secondary">
                            {tag.name}
                        </Badge>
                    ))}
                </div>
            </ModalShell>
        </>
    );
}
