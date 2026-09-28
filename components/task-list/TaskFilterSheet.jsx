'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import ModalShell from '@/components/ui/modal-shell';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useTaskFilterOptions } from '@/hooks/useTaskFilterOptions';
import { useTaskFilters } from '@/hooks/useTaskFilters';
import {
    EMPTY_TASK_FILTERS,
    DUE_BUCKETS,
    CREATED_BUCKETS,
    countActiveFilters,
    filtersToSearchString,
} from '@/lib/task-filters';

/**
 * One checkbox row inside a filter section.
 *
 * @param {object} props
 * @param {string} props.label - Row label
 * @param {boolean} props.checked - Whether this value is currently selected
 * @param {Function} props.onCheckedChange - Called when the row is toggled
 * @param {string} [props.dotColor] - Optional colored dot shown before the label (statuses)
 * @param {number} [props.count] - Optional trailing count badge
 */
function FilterCheckboxRow({ label, checked, onCheckedChange, dotColor, count }) {
    return (
        <label className="flex items-center gap-2.5 py-1.5 cursor-pointer">
            <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
            {dotColor && (
                <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: dotColor }}
                />
            )}
            <span className="text-sm text-foreground flex-1">{label}</span>
            {count != null && <span className="text-xs text-muted-foreground">{count}</span>}
        </label>
    );
}

/**
 * One collapsible, independently-toggleable group of filter checkbox rows.
 *
 * @param {object} props
 * @param {string} props.title - Section label
 * @param {boolean} props.isOpen - Whether this section's rows are expanded
 * @param {Function} props.onToggle - Called to expand/collapse this section
 * @param {import('react').ReactNode} [props.loading] - Rendered instead of children while loading
 * @param {import('react').ReactNode} props.children - The section's checkbox rows
 */
function FilterSection({ title, isOpen, onToggle, loading, children }) {
    return (
        <div className="border-t border-border first:border-t-0 py-1">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center justify-between py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
                {title}
                {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                )}
            </button>
            {isOpen && <div className="pb-2">{loading ?? children}</div>}
        </div>
    );
}

/**
 * Task-list filter sheet - status, tags, due date, creation-date recency, and creator.
 * Staged locally until Apply commits into useTaskFilters' URL-backed applied state.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the sheet is open
 * @param {Function} props.onClose - Called when the sheet should close
 * @param {string|null} props.spaceId - Space the current list belongs to
 * @param {object[]} props.statuses - This space's statuses
 * @param {object} props.countsByStatusId - Task count per status id, for the Status section's badges
 */
export default function TaskFilterSheet({ open, onClose, spaceId, statuses, countsByStatusId }) {
    const isDesktop = useIsDesktop();
    const { tags, members, tagsLoading, membersLoading } = useTaskFilterOptions(spaceId);
    const { filters, applyFilters, clearAll } = useTaskFilters();

    const [draftFilters, setDraftFilters] = useState(filters);
    const [openSections, setOpenSections] = useState({ status: true });

    // Restages the draft from applied filters on open, discarding any unapplied edits from before.
    const [lastOpenState, setLastOpenState] = useState(open);
    if (open !== lastOpenState) {
        setLastOpenState(open);
        if (open) setDraftFilters(filters);
    }

    function toggleSection(sectionKey) {
        setOpenSections((current) => ({ ...current, [sectionKey]: !current[sectionKey] }));
    }

    function toggleDraftValue(dimension, value) {
        setDraftFilters((current) => {
            const currentValues = current[dimension] ?? [];
            const nextValues = currentValues.includes(value)
                ? currentValues.filter((existingValue) => existingValue !== value)
                : [...currentValues, value];
            return { ...current, [dimension]: nextValues };
        });
    }

    function handleApply() {
        applyFilters(draftFilters);
        onClose();
    }

    function handleClear() {
        setDraftFilters(EMPTY_TASK_FILTERS);
        clearAll();
    }

    const draftActiveCount = countActiveFilters(draftFilters);
    const hasUnappliedChanges =
        filtersToSearchString(draftFilters) !== filtersToSearchString(filters);

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            variant="sheet"
            side={isDesktop ? 'right' : 'bottom'}
            title="Filters"
            contentClassName={isDesktop ? 'sm:max-w-md' : undefined}
            footerClassName="mt-auto"
            footer={
                <>
                    <Button
                        variant="outline"
                        onClick={handleClear}
                        disabled={draftActiveCount === 0}
                    >
                        Clear filters
                    </Button>
                    <Button onClick={handleApply} disabled={!hasUnappliedChanges}>
                        Apply{draftActiveCount > 0 ? ` (${draftActiveCount})` : ''}
                    </Button>
                </>
            }
        >
            <div className="max-h-[70vh] overflow-y-auto">
                <FilterSection
                    title="Status"
                    isOpen={openSections.status}
                    onToggle={() => toggleSection('status')}
                >
                    {statuses.map((status) => (
                        <FilterCheckboxRow
                            key={status.id}
                            label={status.name}
                            dotColor={status.color}
                            checked={draftFilters.statusIds.includes(status.id)}
                            onCheckedChange={() => toggleDraftValue('statusIds', status.id)}
                            count={countsByStatusId[status.id] ?? 0}
                        />
                    ))}
                </FilterSection>

                <FilterSection
                    title="Tags"
                    isOpen={openSections.tags}
                    onToggle={() => toggleSection('tags')}
                    loading={
                        tagsLoading ? (
                            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                                <Loader size="xs" />
                                Loading tags...
                            </div>
                        ) : null
                    }
                >
                    {tags.map((tag) => (
                        <FilterCheckboxRow
                            key={tag.id}
                            label={tag.name}
                            checked={draftFilters.tagIds.includes(tag.id)}
                            onCheckedChange={() => toggleDraftValue('tagIds', tag.id)}
                        />
                    ))}
                </FilterSection>

                <FilterSection
                    title="Due date"
                    isOpen={openSections.due}
                    onToggle={() => toggleSection('due')}
                >
                    {DUE_BUCKETS.map((bucket) => (
                        <FilterCheckboxRow
                            key={bucket.value}
                            label={bucket.label}
                            checked={draftFilters.due.includes(bucket.value)}
                            onCheckedChange={() => toggleDraftValue('due', bucket.value)}
                        />
                    ))}
                </FilterSection>

                <FilterSection
                    title="Created"
                    isOpen={openSections.created}
                    onToggle={() => toggleSection('created')}
                >
                    {CREATED_BUCKETS.map((bucket) => (
                        <FilterCheckboxRow
                            key={bucket.value}
                            label={bucket.label}
                            checked={draftFilters.created.includes(bucket.value)}
                            onCheckedChange={() => toggleDraftValue('created', bucket.value)}
                        />
                    ))}
                </FilterSection>

                <FilterSection
                    title="Created by"
                    isOpen={openSections.member}
                    onToggle={() => toggleSection('member')}
                    loading={
                        membersLoading ? (
                            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                                <Loader size="xs" />
                                Loading members...
                            </div>
                        ) : null
                    }
                >
                    {members.map((member) => (
                        <FilterCheckboxRow
                            key={member.id}
                            label={member.label}
                            checked={draftFilters.memberIds.includes(member.id)}
                            onCheckedChange={() => toggleDraftValue('memberIds', member.id)}
                        />
                    ))}
                </FilterSection>
            </div>
        </ModalShell>
    );
}
