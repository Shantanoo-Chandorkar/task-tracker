'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useHabitsQuery } from '@/hooks/useHabitsQuery';
import { useHabitCategoriesQuery } from '@/hooks/useHabitCategoriesQuery';
import { useHabitEntriesQuery } from '@/hooks/useHabitEntriesQuery';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { getBrowserTodayLocalDate } from '@/modules/habits/domain/browser-local-date';
import { isDueOn } from '@/modules/habits/domain/recurrence';
import { deleteHabit } from '@/modules/habits/actions/habit-actions';
import { removeRowFromCache } from '@/lib/cache/query-cache';
import { Loader } from '@/components/custom/Loader';
import HabitRow from './HabitRow';
import HabitViewTabs from './HabitViewTabs';
import HabitFormDialog from './HabitFormDialog';
import HabitDeleteDialog from './HabitDeleteDialog';

const UNCATEGORIZED_KEY = 'uncategorized';

/**
 * Groups habits by category, in category order, with an "Uncategorized" group last.
 *
 * @param {object[]} habits - Habits to group.
 * @param {object[]} categories - The caller's categories, in saved order.
 * @returns {{ key: string, name: string, habits: object[] }[]} Non-empty groups only.
 */
function groupHabitsByCategory(habits, categories) {
    const habitsByCategoryId = new Map();
    for (const habit of habits) {
        const categoryKey = habit.category_id ?? UNCATEGORIZED_KEY;
        const group = habitsByCategoryId.get(categoryKey) ?? [];
        group.push(habit);
        habitsByCategoryId.set(categoryKey, group);
    }

    const orderedGroups = categories
        .filter((category) => habitsByCategoryId.has(category.id))
        .map((category) => ({
            key: category.id,
            name: category.name,
            habits: habitsByCategoryId.get(category.id),
        }));

    const uncategorizedHabits = habitsByCategoryId.get(UNCATEGORIZED_KEY);
    if (uncategorizedHabits) {
        orderedGroups.push({
            key: UNCATEGORIZED_KEY,
            name: 'Uncategorized',
            habits: uncategorizedHabits,
        });
    }
    return orderedGroups;
}

/**
 * The Habit Zone's landing view - habits switchable between Today/All/By Category, each row editable/deletable.
 * "Due today" is a pure function of the recurrence rule and date; habits spawn no rows.
 */
export default function HabitListView() {
    const queryClient = useQueryClient();
    const [view, setView] = useState('today');
    const [formDialog, setFormDialog] = useState({ open: false, habit: null });
    const [deleteTarget, setDeleteTarget] = useState(null);
    const deleteConfirm = useConfirmAction(Boolean(deleteTarget));
    const todayLocalDate = getBrowserTodayLocalDate();
    const { data: habits = [], isLoading: isLoadingHabits } = useHabitsQuery();
    const { data: categories = [] } = useHabitCategoriesQuery();
    const { data: entries = [], isLoading: isLoadingEntries } =
        useHabitEntriesQuery(todayLocalDate);

    const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
    const entriesByHabitId = new Map();
    for (const entry of entries) {
        const habitEntries = entriesByHabitId.get(entry.habit_id) ?? [];
        habitEntries.push(entry);
        entriesByHabitId.set(entry.habit_id, habitEntries);
    }

    const activeHabits = habits.filter((habit) => !habit.archived_at);
    const visibleHabits =
        view === 'today'
            ? activeHabits.filter((habit) => isDueOn(habit.recurrence, todayLocalDate))
            : activeHabits;

    function handleConfirmDelete() {
        if (!deleteTarget) return;
        const deletedHabit = deleteTarget;

        return deleteConfirm.runConfirmedAction({
            entityKey: `habit-delete:${deletedHabit.id}`,
            loadingMessage: 'Deleting habit...',
            successMessage: 'Habit deleted',
            action: () => deleteHabit(deletedHabit.id),
            onSuccess: () => {
                removeRowFromCache(queryClient, ['habits'], deletedHabit.id);
                // The deleted habit's own entries are now unreachable dead cache data otherwise.
                queryClient.setQueriesData({ queryKey: ['habit-entries'] }, (cachedEntries) =>
                    Array.isArray(cachedEntries)
                        ? cachedEntries.filter((entry) => entry.habit_id !== deletedHabit.id)
                        : cachedEntries,
                );
            },
            close: () => setDeleteTarget(null),
        });
    }

    /** @param {object} habit */
    function renderRow(habit, showCategory = true) {
        const habitEntries = entriesByHabitId.get(habit.id) ?? [];
        return (
            <HabitRow
                key={habit.id}
                habit={habit}
                entries={habitEntries}
                todayEntry={
                    habitEntries.find((entry) => entry.local_date === todayLocalDate) ?? null
                }
                todayLocalDate={todayLocalDate}
                categoryName={categoryNameById.get(habit.category_id) ?? null}
                showCategory={showCategory}
                onEditRequest={(editedHabit) => setFormDialog({ open: true, habit: editedHabit })}
                onDeleteRequest={setDeleteTarget}
            />
        );
    }

    return (
        <div className="space-y-4">
            <HabitViewTabs view={view} onChange={setView} />

            {isLoadingHabits || isLoadingEntries ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader size="sm" />
                    Loading your habits...
                </div>
            ) : visibleHabits.length === 0 ? (
                <div className="space-y-3 py-12 text-center text-sm text-muted-foreground">
                    <p>
                        {view === 'today'
                            ? 'No habits due today. Start one now.'
                            : 'No habits yet. Start one now.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => setFormDialog({ open: true, habit: null })}
                        className="rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40"
                    >
                        + Start a habit
                    </button>
                </div>
            ) : view === 'byCategory' ? (
                <div className="space-y-4">
                    {groupHabitsByCategory(visibleHabits, categories).map((group) => (
                        <div key={group.key}>
                            <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {group.name}
                            </h2>
                            <div className="rounded-xl bg-card">
                                {group.habits.map((habit) => renderRow(habit, false))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-xl bg-card">
                    {visibleHabits.map((habit) => renderRow(habit))}
                </div>
            )}

            <HabitFormDialog
                open={formDialog.open}
                onClose={() => setFormDialog({ open: false, habit: null })}
                habit={formDialog.habit}
            />

            <HabitDeleteDialog
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleConfirmDelete}
                habitTitle={deleteTarget?.title}
                isPending={deleteConfirm.isPending}
                errorMessage={deleteConfirm.errorMessage}
            />
        </div>
    );
}
