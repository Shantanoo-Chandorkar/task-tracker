'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { RECURRENCE_KINDS } from '@/modules/habits/domain/recurrence';
import { cn } from '@/lib/ui/class-names';

const KIND_LABELS = {
    daily: 'Every day',
    weekdays: 'Specific days of the week',
    times_per_week: 'A number of times a week',
    every_n_days: 'Every N days',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** @param {{ kind: string }} recurrence */
function withDefaultsForKind(recurrence, todayLocalDate) {
    if (recurrence.kind === 'weekdays' && !recurrence.days) return { kind: 'weekdays', days: [1] };
    if (recurrence.kind === 'times_per_week' && !recurrence.count) {
        return { kind: 'times_per_week', count: 3 };
    }
    if (recurrence.kind === 'every_n_days' && !recurrence.n) {
        return { kind: 'every_n_days', n: 2, anchor: todayLocalDate };
    }
    return recurrence;
}

/**
 * Picks a habit's recurrence kind, one of the four modules/habits/domain/recurrence.js understands.
 * Split from `HabitRecurrenceDetails` so a parent grid can place the weekday row outside either column.
 *
 * @param {object} props
 * @param {{ kind: string }} props.recurrence - Current rule.
 * @param {(recurrence: object) => void} props.onChange - Called with the updated rule.
 * @param {string} props.todayLocalDate - 'YYYY-MM-DD', used as the default anchor for every_n_days.
 * @param {boolean} [props.disabled] - Locks the control while saving.
 */
export function HabitRecurrenceTypeSelect({
    recurrence,
    onChange,
    todayLocalDate,
    disabled = false,
}) {
    return (
        <Select
            value={recurrence.kind}
            onValueChange={(kind) => onChange(withDefaultsForKind({ kind }, todayLocalDate))}
            disabled={disabled}
        >
            <SelectTrigger className="w-full min-w-0">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {RECURRENCE_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                        {KIND_LABELS[kind]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/**
 * The conditional control a recurrence kind needs: weekday buttons, a times-per-week count, or an
 * every-N-days interval. Renders nothing for 'daily', which needs no extra input.
 *
 * @param {object} props
 * @param {{ kind: string }} props.recurrence - Current rule.
 * @param {(recurrence: object) => void} props.onChange - Called with the updated rule.
 * @param {string} props.todayLocalDate - 'YYYY-MM-DD', used as the default anchor for every_n_days.
 * @param {boolean} [props.disabled] - Locks every control while saving.
 */
export function HabitRecurrenceDetails({ recurrence, onChange, todayLocalDate, disabled = false }) {
    if (recurrence.kind === 'weekdays') {
        return (
            <div className="flex gap-1.5" role="group" aria-label="Days of the week">
                {WEEKDAY_LABELS.map((label, day) => {
                    const isSelected = recurrence.days?.includes(day);
                    return (
                        <Button
                            key={day}
                            type="button"
                            size="sm"
                            variant={isSelected ? 'default' : 'outline'}
                            disabled={disabled}
                            aria-pressed={isSelected}
                            className={cn('flex-1 px-0')}
                            onClick={() => {
                                const days = isSelected
                                    ? recurrence.days.filter((selectedDay) => selectedDay !== day)
                                    : [...(recurrence.days ?? []), day];
                                if (days.length > 0) onChange({ kind: 'weekdays', days });
                            }}
                        >
                            {label}
                        </Button>
                    );
                })}
            </div>
        );
    }

    if (recurrence.kind === 'times_per_week') {
        return (
            <Input
                type="number"
                min={1}
                max={7}
                value={recurrence.count ?? ''}
                disabled={disabled}
                aria-label="Times per week"
                onChange={(event) =>
                    onChange({ kind: 'times_per_week', count: Number(event.target.value) })
                }
            />
        );
    }

    if (recurrence.kind === 'every_n_days') {
        return (
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Every</span>
                <Input
                    type="number"
                    min={1}
                    max={365}
                    value={recurrence.n ?? ''}
                    disabled={disabled}
                    aria-label="Number of days"
                    onChange={(event) =>
                        onChange({
                            kind: 'every_n_days',
                            n: Number(event.target.value),
                            anchor: recurrence.anchor ?? todayLocalDate,
                        })
                    }
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">days</span>
            </div>
        );
    }

    return null;
}
