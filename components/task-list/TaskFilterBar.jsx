'use client';

import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTaskFilters } from '@/hooks/useTaskFilters';
import { useTaskFilterOptions } from '@/hooks/useTaskFilterOptions';
import { DUE_BUCKETS, CREATED_BUCKETS } from '@/lib/tasks/task-filters';

const DIMENSION_LABELS = {
    statusIds: 'Status',
    tagIds: 'Tags',
    due: 'Due date',
    created: 'Created',
    memberIds: 'Created by',
};

/**
 * Builds one group per active dimension, each holding its currently-applied chip values.
 * A dimension with nothing selected is omitted entirely.
 *
 * @param {object} filters - Applied filters, same shape `useTaskFilters` returns
 * @param {object[]} statuses - This space's statuses, for status chip labels
 * @param {object[]} tags - This space's tags, for tag chip labels
 * @param {{id: string, label: string}[]} members - This space's owner + collaborators
 * @returns {{dimension: string, label: string, chips: {value: string, label: string}[]}[]}
 */
function buildFilterChipGroups(filters, statuses, tags, members) {
    const dueLabelByValue = new Map(DUE_BUCKETS.map((bucket) => [bucket.value, bucket.label]));
    const createdLabelByValue = new Map(
        CREATED_BUCKETS.map((bucket) => [bucket.value, bucket.label]),
    );

    const chipsByDimension = {
        statusIds: filters.statusIds.map((statusId) => ({
            value: statusId,
            label: statuses.find((status) => status.id === statusId)?.name ?? statusId,
        })),
        tagIds: filters.tagIds.map((tagId) => ({
            value: tagId,
            label: tags.find((tag) => tag.id === tagId)?.name ?? tagId,
        })),
        due: filters.due.map((bucket) => ({
            value: bucket,
            label: dueLabelByValue.get(bucket) ?? bucket,
        })),
        created: filters.created.map((bucket) => ({
            value: bucket,
            label: createdLabelByValue.get(bucket) ?? bucket,
        })),
        memberIds: filters.memberIds.map((memberId) => ({
            value: memberId,
            label: members.find((member) => member.id === memberId)?.label ?? memberId,
        })),
    };

    return Object.entries(chipsByDimension)
        .filter(([, chips]) => chips.length > 0)
        .map(([dimension, chips]) => ({ dimension, label: DIMENSION_LABELS[dimension], chips }));
}

/**
 * "Filters" trigger button, plus the active-filter chip groups and "Clear filters" button.
 * Both reflect the applied filters and act instantly, unlike the sheet's staged draft.
 *
 * @param {object} props
 * @param {string|null} props.spaceId - Space the current list belongs to
 * @param {object[]} props.statuses - This space's statuses, for status chip labels
 * @param {Function} props.onOpenSheet - Called when the "Filters" button is clicked
 */
export default function TaskFilterBar({ spaceId, statuses, onOpenSheet }) {
    const { filters, activeCount, toggleFilter, clearAll } = useTaskFilters();
    const { tags, members } = useTaskFilterOptions(spaceId);
    const chipGroups = buildFilterChipGroups(filters, statuses, tags, members);

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                onClick={onOpenSheet}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
                <Filter className="h-3.5 w-3.5" />
                Filters
                {activeCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground">
                        {activeCount}
                    </span>
                )}
            </button>

            {chipGroups.map((group) => (
                <div
                    key={group.dimension}
                    className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted px-2.5 py-1 text-xs"
                >
                    <span className="font-medium text-foreground">{group.label}:</span>
                    {group.chips.map((chip, chipIndex) => (
                        <span
                            key={chip.value}
                            className="flex items-center gap-1 text-muted-foreground"
                        >
                            {chip.label}
                            <button
                                type="button"
                                onClick={() => toggleFilter(group.dimension, chip.value)}
                                aria-label={`Remove ${chip.label} filter`}
                                className="hit-area hover:text-destructive"
                            >
                                <X className="h-3 w-3" />
                            </button>
                            {chipIndex < group.chips.length - 1 && <span>,</span>}
                        </span>
                    ))}
                </div>
            ))}

            {activeCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAll}>
                    Clear filters
                </Button>
            )}
        </div>
    );
}
