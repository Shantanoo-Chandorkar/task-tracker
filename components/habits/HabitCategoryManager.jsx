'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader } from '@/components/custom/Loader';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useHabitCategoriesQuery } from '@/hooks/useHabitCategoriesQuery';
import { removeRowFromCache } from '@/lib/cache/query-cache';
import { deleteHabitCategory } from '@/modules/habits/actions/habit-category-actions';
import HabitCategoryRow from './HabitCategoryRow';
import HabitCategoryFormDialog from './HabitCategoryFormDialog';
import HabitCategoryDeleteDialog from './HabitCategoryDeleteDialog';

/**
 * Settings UI for the caller's habit categories: list, add/edit dialog, delete confirm.
 * No reordering yet - out of B2's scope, since the plan named no reorder hook/action for this.
 */
export default function HabitCategoryManager() {
    const queryClient = useQueryClient();
    const { data: categories = [], isLoading } = useHabitCategoriesQuery();
    const [formDialog, setFormDialog] = useState({ open: false, category: null });
    const [deleteTarget, setDeleteTarget] = useState(null);
    const deleteConfirm = useConfirmAction(Boolean(deleteTarget));

    function handleConfirmDelete() {
        if (!deleteTarget) return;
        const deletedCategory = deleteTarget;

        return deleteConfirm.runConfirmedAction({
            entityKey: `habit-category-delete:${deletedCategory.id}`,
            loadingMessage: 'Deleting category...',
            successMessage: 'Category deleted',
            action: () => deleteHabitCategory(deletedCategory.id),
            onSuccess: () => {
                removeRowFromCache(queryClient, ['habit-categories'], deletedCategory.id);
                queryClient.invalidateQueries({ queryKey: ['habits'] });
            },
            close: () => setDeleteTarget(null),
        });
    }

    return (
        <div className="space-y-4 max-w-lg">
            <div>
                <h2 className="text-base font-semibold mb-1">Categories</h2>
                <p className="text-sm text-muted-foreground">
                    Group related habits together, like Health or Work.
                </p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-card py-6 text-sm text-muted-foreground">
                    <Loader size="sm" />
                    Loading categories...
                </div>
            ) : categories.length === 0 ? (
                <div className="rounded-xl bg-card py-6 text-center text-sm text-muted-foreground">
                    No categories yet.
                </div>
            ) : (
                <div className="rounded-xl bg-card">
                    {categories.map((category) => (
                        <HabitCategoryRow
                            key={category.id}
                            category={category}
                            onEditRequest={(editedCategory) =>
                                setFormDialog({ open: true, category: editedCategory })
                            }
                            onDeleteRequest={setDeleteTarget}
                        />
                    ))}
                </div>
            )}

            <button
                type="button"
                onClick={() => setFormDialog({ open: true, category: null })}
                className="w-full rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40"
            >
                + Add category
            </button>

            <HabitCategoryFormDialog
                open={formDialog.open}
                onClose={() => setFormDialog({ open: false, category: null })}
                category={formDialog.category}
            />

            <HabitCategoryDeleteDialog
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleConfirmDelete}
                categoryName={deleteTarget?.name}
                isPending={deleteConfirm.isPending}
                errorMessage={deleteConfirm.errorMessage}
            />
        </div>
    );
}
