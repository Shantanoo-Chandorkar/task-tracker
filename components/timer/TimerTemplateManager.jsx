'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader } from '@/components/custom/Loader';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useTimerTemplatesQuery } from '@/hooks/useTimerTemplatesQuery';
import { removeRowFromCache } from '@/lib/cache/query-cache';
import { deleteTimerTemplate } from '@/modules/timer/actions/timer-template-actions';
import TimerTemplateRow from './TimerTemplateRow';
import TimerTemplateFormDialog from './TimerTemplateFormDialog';
import TimerTemplateDeleteDialog from './TimerTemplateDeleteDialog';

/**
 * Settings UI for the caller's timer templates: list, add/edit dialog, delete confirm, duplicate.
 */
export default function TimerTemplateManager() {
    const queryClient = useQueryClient();
    const { data: templates = [], isLoading } = useTimerTemplatesQuery();
    const [formDialog, setFormDialog] = useState({ open: false, template: null });
    const [deleteTarget, setDeleteTarget] = useState(null);
    const deleteConfirm = useConfirmAction(Boolean(deleteTarget));

    function handleConfirmDelete() {
        if (!deleteTarget) return;
        const deletedTemplate = deleteTarget;

        return deleteConfirm.runConfirmedAction({
            entityKey: `timer-template-delete:${deletedTemplate.id}`,
            loadingMessage: 'Deleting template...',
            successMessage: 'Template deleted',
            action: () => deleteTimerTemplate(deletedTemplate.id),
            onSuccess: () =>
                removeRowFromCache(queryClient, ['timer-templates'], deletedTemplate.id),
            close: () => setDeleteTarget(null),
        });
    }

    return (
        <div className="space-y-4 max-w-lg">
            <div>
                <h2 className="text-base font-semibold mb-1">Templates</h2>
                <p className="text-sm text-muted-foreground">
                    Work/break sequences you can start a session from, like Pomodoro.
                </p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-card py-6 text-sm text-muted-foreground">
                    <Loader size="sm" />
                    Loading templates...
                </div>
            ) : templates.length === 0 ? (
                <div className="rounded-xl bg-card py-6 text-center text-sm text-muted-foreground">
                    No templates yet.
                </div>
            ) : (
                <div className="rounded-xl bg-card">
                    {templates.map((template) => (
                        <TimerTemplateRow
                            key={template.id}
                            template={template}
                            onEditRequest={(editedTemplate) =>
                                setFormDialog({ open: true, template: editedTemplate })
                            }
                            onDeleteRequest={setDeleteTarget}
                        />
                    ))}
                </div>
            )}

            <button
                type="button"
                onClick={() => setFormDialog({ open: true, template: null })}
                className="w-full rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40"
            >
                + Add template
            </button>

            <TimerTemplateFormDialog
                open={formDialog.open}
                onClose={() => setFormDialog({ open: false, template: null })}
                template={formDialog.template}
            />

            <TimerTemplateDeleteDialog
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleConfirmDelete}
                templateName={deleteTarget?.name}
                isPending={deleteConfirm.isPending}
                errorMessage={deleteConfirm.errorMessage}
            />
        </div>
    );
}
