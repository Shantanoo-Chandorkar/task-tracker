'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTagsQuery } from '@/hooks/useTagsQuery';
import { usePermissionForSpace } from '@/hooks/usePermissionForSpace';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import { removeRowFromCache } from '@/lib/cache/query-cache';
import { pluralize } from '@/lib/ui/pluralize';
import { createTag, updateTag, deleteTag, deleteAllTagsInSpace } from '@/actions/tag-actions';
import { reorderTags } from '@/actions/reorder-actions';
import LabelManager from '@/components/space-labels/LabelManager';
import LabelDeleteDialog from '@/components/space-labels/LabelDeleteDialog';

const TAG_ACTIONS = {
    create: createTag,
    update: updateTag,
    remove: deleteTag,
    saveOrder: reorderTags,
};

/**
 * Full tag management UI for one space, rendered inside the space's Settings sheet.
 * Tags are made here, like statuses, and chosen from this list on tasks.
 *
 * @param {object} props
 * @param {string} props.spaceId - Space these tags belong to
 */
export default function TagManager({ spaceId }) {
    const queryClient = useQueryClient();
    const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false);
    const wipeConfirm = useConfirmAction(wipeConfirmOpen);

    const { data: tags = [], isLoading } = useTagsQuery(spaceId);
    // A UX hint only: the server refuses a read-only collaborator's write anyway
    const isReadOnly = usePermissionForSpace(spaceId) === 'read_only';

    async function invalidateAfterChange() {
        await queryClient.invalidateQueries({ queryKey: ['tags', spaceId] });
        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        bustPageCache({ prefixes: ['/lists/'] });
    }

    // The row leaves the list at once, so the popup closes onto the final screen; the reload is quiet.
    function handleTagDeleted(deletedTag) {
        removeRowFromCache(queryClient, ['tags', spaceId], deletedTag.id);
        invalidateAfterChange();
    }

    function handleConfirmWipe() {
        return wipeConfirm.runConfirmedAction({
            entityKey: `tags-wipe:${spaceId}`,
            loadingMessage: 'Deleting all tags...',
            successMessage: (wipeResult) => `Deleted ${pluralize(wipeResult.count, 'tag')}`,
            action: () => deleteAllTagsInSpace(spaceId),
            onSuccess: () => {
                queryClient.setQueryData(['tags', spaceId], []);
                invalidateAfterChange();
            },
            close: () => setWipeConfirmOpen(false),
        });
    }

    return (
        <LabelManager
            spaceId={spaceId}
            noun="Tag"
            resourceKey="tags"
            heading="Tags"
            description="Add tags here, then pick them on a task. Delete one to remove it from every task in this space."
            deleteDescription="This removes the tag from every task in this space. This cannot be undone."
            emptyMessage="No tags in this space yet."
            labels={tags}
            isLoading={isLoading}
            isReadOnly={isReadOnly}
            actions={TAG_ACTIONS}
            onLabelDeleted={handleTagDeleted}
        >
            <button
                type="button"
                onClick={() => setWipeConfirmOpen(true)}
                disabled={!spaceId || isLoading || tags.length === 0}
                className="w-full rounded-lg border border-dashed border-destructive/40 py-2.5 text-sm text-destructive hover:border-destructive disabled:opacity-50 disabled:pointer-events-none"
            >
                Delete all tags in this space
            </button>

            <LabelDeleteDialog
                open={wipeConfirmOpen}
                onClose={() => setWipeConfirmOpen(false)}
                onConfirm={handleConfirmWipe}
                title="Delete all tags?"
                description={`This removes all ${pluralize(tags.length, 'tag')} from every task in this space. This cannot be undone.`}
                isPending={wipeConfirm.isPending}
                errorMessage={wipeConfirm.errorMessage}
                confirmLabel="Delete all"
            />
        </LabelManager>
    );
}
