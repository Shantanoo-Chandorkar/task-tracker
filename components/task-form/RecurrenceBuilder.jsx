'use client';

import { useState, useEffect } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { humanReadableLabel } from '@/lib/recurrence';

const FREQUENCIES = [
    { value: 'DAILY', label: 'Daily' },
    { value: 'WEEKLY', label: 'Weekly' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'YEARLY', label: 'Yearly' },
];

const END_CONDITIONS = [
    { value: 'never', label: 'Never' },
    { value: 'after', label: 'After N occurrences' },
    { value: 'on', label: 'On date' },
];

/**
 * Builds a recurrence rule object from current field values.
 *
 * @param {string} freq
 * @param {number} interval
 * @param {string} endCondition
 * @param {number} count
 * @param {string} until
 * @returns {object} Recurrence rule
 */
function buildRule(freq, interval, endCondition, count, until) {
    const rule = { freq, interval: parseInt(interval) || 1 };
    if (endCondition === 'after' && count) rule.count = parseInt(count);
    if (endCondition === 'on' && until) rule.until = until;
    return rule;
}

/**
 * UI for configuring an rrule recurrence schedule.
 * Outputs a controlled recurrence_rule JSONB object via the onChange callback.
 * Shows a live human-readable preview of the schedule.
 *
 * @param {object} props
 * @param {object|null} props.value - Current recurrence rule object
 * @param {Function} props.onChange - Called with the new rule object on any change
 */
export default function RecurrenceBuilder({ value, onChange }) {
    const [freq, setFreq] = useState(value?.freq ?? 'WEEKLY');
    const [interval, setInterval] = useState(value?.interval ?? 1);
    const [endCondition, setEndCondition] = useState(
        value?.count ? 'after' : value?.until ? 'on' : 'never',
    );
    const [count, setCount] = useState(value?.count ?? 5);
    const [until, setUntil] = useState(value?.until ?? '');

    // Emit updated rule whenever any field changes
    useEffect(() => {
        const rule = buildRule(freq, interval, endCondition, count, until);
        onChange(rule);
    }, [freq, interval, endCondition, count, until]);

    const previewLabel = humanReadableLabel(buildRule(freq, interval, endCondition, count, until));

    return (
        <div className="space-y-3 p-3 rounded-md border border-border bg-muted/20">
            {/* Frequency + interval row */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex-shrink-0">Every</span>
                <Input
                    type="number"
                    min={1}
                    value={interval}
                    onChange={(e) => setInterval(e.target.value)}
                    className="w-16 h-7 text-xs"
                />
                <Select value={freq} onValueChange={setFreq}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {FREQUENCIES.map((f) => (
                            <SelectItem key={f.value} value={f.value}>
                                {f.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* End condition */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex-shrink-0">Ends</span>
                <Select value={endCondition} onValueChange={setEndCondition}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {END_CONDITIONS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                                {c.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {endCondition === 'after' && (
                    <Input
                        type="number"
                        min={1}
                        value={count}
                        onChange={(e) => setCount(e.target.value)}
                        className="w-20 h-7 text-xs"
                        placeholder="times"
                    />
                )}

                {endCondition === 'on' && (
                    <Input
                        type="date"
                        value={until}
                        onChange={(e) => setUntil(e.target.value)}
                        className="h-7 text-xs"
                    />
                )}
            </div>

            {/* Human-readable preview */}
            {previewLabel && (
                <p className="text-xs text-muted-foreground italic">Repeats {previewLabel}</p>
            )}
        </div>
    );
}
