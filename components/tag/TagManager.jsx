'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTagsQuery } from '@/hooks/useTagsQuery';
import { toast } from 'sonner';
import { bustPageCache } from '@/lib/service-worker-cache';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import ModalShell from '@/components/ui/modal-shell';
import { deleteTag, deleteAllTagsInSpace } from '@/actions/tag-actions';

/**
 * Single tag row with its own delete affordance.
 *
 * Not gated by isOwnRow client-side - the server enforces it, matching StatusRow's delete button.
 *
 * @param {object} props
 * @param {object} props.tag - Tag to display
 * @param {Function} props.onDeleteRequest - Called with the tag to ask for delete confirmation
 */
function TagRow({ tag, onDeleteRequest }) {
    return (
        <div className="flex items-center gap-3 py-2.5 px-3 border-b border-border last:border-b-0">
            <span className="flex-1 text-sm text-foreground">{tag.name}</span>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onDeleteRequest(tag)}
                aria-label="Delete tag"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}

/**
 * Full tag management UI for one space, rendered inside the space's Settings sheet.
 * Tags are created from the task detail page's tag picker - this only handles removing them.
 *
 * @param {object} props
 * @param {string} props.spaceId - Space these tags belong to
 */
export default function TagManager({ spaceId }) {
    const queryClient = useQueryClient();
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false);
    const [wiping, setWiping] = useState(false);

    const { data: tags = [], isLoading } = useTagsQuery(spaceId);

    async function invalidateAfterChange() {
        await queryClient.invalidateQueries({ queryKey: ['tags', spaceId] });
        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        bustPageCache({ prefixes: ['/lists/'] });
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return;

        setDeleting(true);
        const toastId = toast.loading('Deleting tag...');

        let result;
        try {
            result = await deleteTag(deleteTarget.id);
        } catch {
            setDeleting(false);
            setDeleteTarget(null);
            toast.error('Could not reach the server. Try again.', { id: toastId });
            return;
        }
        setDeleting(false);
        setDeleteTarget(null);

        if (result.error) {
            toast.error(result.error, { id: toastId });
        } else {
            await invalidateAfterChange();
            toast.success('Tag deleted', { id: toastId });
        }
    }

    async function handleConfirmWipe() {
        setWiping(true);
        const toastId = toast.loading('Deleting all tags...');

        let result;
        try {
            result = await deleteAllTagsInSpace(spaceId);
        } catch {
            setWiping(false);
            setWipeConfirmOpen(false);
            toast.error('Could not reach the server. Try again.', { id: toastId });
            return;
        }
        setWiping(false);
        setWipeConfirmOpen(false);

        if (result.error) {
            toast.error(result.error, { id: toastId });
        } else {
            await invalidateAfterChange();
            toast.success(`Deleted ${result.count} tag${result.count === 1 ? '' : 's'}`, {
                id: toastId,
            });
        }
    }

    return (
        <div className="space-y-4 max-w-lg">
            <div>
                <h2 className="text-base font-semibold mb-1">Tags</h2>
                <p className="text-sm text-muted-foreground">
                    Tags are created from a task&rsquo;s detail page. Delete one here to remove it
                    from every task in this space.
                </p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-card py-6 text-sm text-muted-foreground">
                    <Loader size="sm" />
                    Loading tags...
                </div>
            ) : tags.length === 0 ? (
                <div className="rounded-xl bg-card py-6 text-center text-sm text-muted-foreground">
                    No tags in this space yet.
                </div>
            ) : (
                <div className="rounded-xl bg-card">
                    {tags.map((tag) => (
                        <TagRow key={tag.id} tag={tag} onDeleteRequest={setDeleteTarget} />
                    ))}
                </div>
            )}

            <button
                type="button"
                onClick={() => setWipeConfirmOpen(true)}
                disabled={!spaceId || isLoading || tags.length === 0}
                className="w-full rounded-lg border border-dashed border-destructive/40 py-2.5 text-sm text-destructive hover:border-destructive disabled:opacity-50 disabled:pointer-events-none"
            >
                Delete all tags in this space
            </button>

            <ModalShell
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                variant="alert"
                title={<>Delete &ldquo;{deleteTarget?.name}&rdquo;?</>}
                description="This removes the tag from every task in this space. This cannot be undone."
                footer={
                    <>
                        <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={deleting}
                            className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting && <Loader size="xs" />}
                            Delete
                        </AlertDialogAction>
                    </>
                }
            />

            <ModalShell
                open={wipeConfirmOpen}
                onClose={() => setWipeConfirmOpen(false)}
                variant="alert"
                title="Delete all tags?"
                description={`This removes all ${tags.length} tag${tags.length === 1 ? '' : 's'} from every task in this space. This cannot be undone.`}
                footer={
                    <>
                        <AlertDialogCancel onClick={() => setWipeConfirmOpen(false)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmWipe}
                            disabled={wiping}
                            className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {wiping && <Loader size="xs" />}
                            Delete all
                        </AlertDialogAction>
                    </>
                }
            />
        </div>
    );
}
