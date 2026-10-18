'use client';

import { Flame } from 'lucide-react';
import { computeStreaks } from '@/modules/habits/domain/streaks';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import RowActionsMenu from '@/components/custom/RowActionsMenu';
import HabitCheckInControl from './HabitCheckInControl';

/**
 * One habit row: color dot, title, category, current streak, its check-in control, and a row menu.
 * A dumb renderer - the caller owns the edit/delete dialog state, same as `HabitCategoryRow`.
 *
 * @param {object} props
 * @param {object} props.habit - The habit to render.
 * @param {object[]} props.entries - This habit's own entries (any order), for the streak count.
 * @param {object|null} props.todayEntry - Today's existing entry, or null if none is logged yet.
 * @param {string} props.todayLocalDate - 'YYYY-MM-DD', used to compute the current streak.
 * @param {string|null} props.categoryName - The habit's category name, or null if uncategorised.
 * @param {boolean} [props.showCategory] - False when a category header already shown it (grouped views).
 * @param {(habit: object) => void} props.onEditRequest - Called with the habit to open it for editing.
 * @param {(habit: object) => void} props.onDeleteRequest - Called with the habit to ask for delete confirmation.
 * @param {(habit: object) => void} props.onLogPastDayRequest - Called with the habit to back-fill a past day.
 */
export default function HabitRow({
    habit,
    entries,
    todayEntry,
    todayLocalDate,
    categoryName,
    showCategory = true,
    onEditRequest,
    onDeleteRequest,
    onLogPastDayRequest,
}) {
    const { currentStreak } = computeStreaks(habit, entries, todayLocalDate);

    return (
        <div className="flex items-center gap-3 border-b border-border/60 px-2 py-3 last:border-b-0">
            <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: habit.color }}
                aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{habit.title}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {showCategory && categoryName && (
                        <span className="truncate">{categoryName}</span>
                    )}
                    {currentStreak > 0 && (
                        <span className="flex items-center gap-0.5">
                            <Flame className="h-3 w-3" aria-hidden="true" />
                            {currentStreak}
                        </span>
                    )}
                </div>
            </div>
            <HabitCheckInControl
                habit={habit}
                todayEntry={todayEntry}
                todayLocalDate={todayLocalDate}
            />
            <RowActionsMenu label={`More actions for ${habit.title}`} isCompact>
                <DropdownMenuItem onClick={() => onEditRequest(habit)}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onLogPastDayRequest(habit)}>
                    Log a different day
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => onDeleteRequest(habit)}
                    className="text-destructive focus:text-destructive"
                >
                    Delete
                </DropdownMenuItem>
            </RowActionsMenu>
        </div>
    );
}
