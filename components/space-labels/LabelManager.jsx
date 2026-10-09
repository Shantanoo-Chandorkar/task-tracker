'use client';

import { useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Loader } from '@/components/custom/Loader';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useDragSensors } from '@/hooks/useDragSensors';
import { useLabelReorder } from '@/hooks/useLabelReorder';
import { getMoveTargets } from '@/lib/tasks/move-neighbours';
import { buildAnnouncements, SCREEN_READER_INSTRUCTIONS } from '@/lib/ui/dnd-announcements';
import LabelRow from './LabelRow';
import LabelFormDialog from './LabelFormDialog';
import LabelDeleteDialog from './LabelDeleteDialog';

/**
 * Settings UI for one kind of space label (statuses, tags): sortable list, add and edit dialog, delete confirm.
 *
 * @param {object} props
 * @param {string} props.spaceId - Space the labels belong to
 * @param {string} props.noun - Capitalised kind of label, e.g. 'Status' or 'Tag'
 * @param {string} props.resourceKey - Cache key of the label list, e.g. 'statuses'
 * @param {string} props.heading - Plural title, e.g. 'Statuses'
 * @param {string} props.description - Sentence under the heading
 * @param {string} props.deleteDescription - What deleting a label does, shown in the confirm popup
 * @param {string} props.emptyMessage - Shown when the space has no labels
 * @param {object[]} props.labels - The space's labels in display order
 * @param {boolean} props.isLoading - Whether the labels are still loading
 * @param {boolean} [props.isReadOnly] - Hides every control that changes labels
 * @param {{
 *   create: Function, update: Function, remove: Function, saveOrder: Function,
 * }} props.actions - Server actions of this kind of label
 * @param {(label: object, labels: object[]) => string|null} [props.getDeleteBlockedReason] - Why a label cannot be
 *   deleted (shown on the disabled menu item), or null
 * @param {(label: object) => import('react').ReactNode} [props.renderBadges] - Extra text after a label's name
 * @param {(deletedLabel: object) => Promise<void>|void} props.onLabelDeleted - Makes the screen final after a delete;
 *   the popup closes once it settles
 * @param {import('react').ReactNode} [props.children] - Extra controls under the add button
 */
export default function LabelManager({
    spaceId,
    noun,
    resourceKey,
    heading,
    description,
    deleteDescription,
    emptyMessage,
    labels,
    isLoading,
    isReadOnly = false,
    actions,
    getDeleteBlockedReason = () => null,
    renderBadges,
    onLabelDeleted,
    children,
}) {
    const lowerNoun = noun.toLowerCase();
    const [formDialog, setFormDialog] = useState({ open: false, label: null });
    const [deleteTarget, setDeleteTarget] = useState(null);
    const deleteConfirm = useConfirmAction(Boolean(deleteTarget));

    const sensors = useDragSensors();
    const { handleDragEnd, moveLabelNextTo } = useLabelReorder({
        resourceKey,
        spaceId,
        labels,
        saveOrder: actions.saveOrder,
    });
    const announcements = buildAnnouncements(
        (rowId) => labels.find((label) => label.id === rowId)?.name,
    );

    function handleConfirmDelete() {
        if (!deleteTarget) return;
        const deletedLabel = deleteTarget;

        return deleteConfirm.runConfirmedAction({
            entityKey: `${lowerNoun}-delete:${deletedLabel.id}`,
            loadingMessage: `Deleting ${lowerNoun}...`,
            successMessage: `${noun} deleted`,
            action: () => actions.remove(deletedLabel.id),
            onSuccess: () => onLabelDeleted(deletedLabel),
            close: () => setDeleteTarget(null),
        });
    }

    return (
        <div className="space-y-4 max-w-lg">
            <div>
                <h2 className="text-base font-semibold mb-1">{heading}</h2>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-card py-6 text-sm text-muted-foreground">
                    <Loader size="sm" />
                    {`Loading ${heading.toLowerCase()}...`}
                </div>
            ) : labels.length === 0 ? (
                <div className="rounded-xl bg-card py-6 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                </div>
            ) : (
                <DndContext
                    id={`${lowerNoun}-dnd`}
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    accessibility={{
                        announcements,
                        screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
                    }}
                >
                    <SortableContext
                        items={labels.map((label) => label.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="rounded-xl bg-card">
                            {labels.map((label) => (
                                <LabelRow
                                    key={label.id}
                                    label={label}
                                    isReadOnly={isReadOnly}
                                    badges={renderBadges?.(label)}
                                    deleteBlockedReason={getDeleteBlockedReason(label, labels)}
                                    moveTargets={getMoveTargets(labels, label.id)}
                                    onEditRequest={(editedLabel) =>
                                        setFormDialog({ open: true, label: editedLabel })
                                    }
                                    onDeleteRequest={setDeleteTarget}
                                    onMove={moveLabelNextTo}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            {!isReadOnly && (
                <button
                    type="button"
                    onClick={() => setFormDialog({ open: true, label: null })}
                    disabled={!spaceId || isLoading}
                    className="w-full rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-50 disabled:pointer-events-none"
                >
                    {`+ Add ${lowerNoun}`}
                </button>
            )}

            {!isReadOnly && children}

            <LabelFormDialog
                open={formDialog.open}
                onClose={() => setFormDialog({ open: false, label: null })}
                noun={noun}
                label={formDialog.label}
                spaceId={spaceId}
                resourceKey={resourceKey}
                create={actions.create}
                update={actions.update}
            />

            <LabelDeleteDialog
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleConfirmDelete}
                title={<>Delete &ldquo;{deleteTarget?.name}&rdquo;?</>}
                description={deleteDescription}
                isPending={deleteConfirm.isPending}
                errorMessage={deleteConfirm.errorMessage}
            />
        </div>
    );
}
