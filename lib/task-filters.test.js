import { describe, expect, it } from 'vitest';
import {
    parseTaskFilters,
    filtersToSearchString,
    countActiveFilters,
    isOverdue,
    isDueToday,
    isDueThisWeek,
    hasNoDueDate,
    isCreatedToday,
    isCreatedLast7Days,
    isCreatedThisWeek,
    isCreatedThisMonth,
    isCreatedOlderThanMonth,
    taskMatchesFilters,
} from './task-filters';

const DONE_STATUS_ID = 'done';

function isoDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
}

// Local calendar date, unlike toISOString().slice(0, 10) which is UTC and can disagree with "today".
function localDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

describe('parseTaskFilters / filtersToSearchString', () => {
    it('parses a query string into filter arrays', () => {
        const searchParams = new URLSearchParams('status=done,doing&tag=urgent');
        expect(parseTaskFilters(searchParams)).toEqual({
            statusIds: ['done', 'doing'],
            tagIds: ['urgent'],
            due: [],
            created: [],
            memberIds: [],
        });
    });

    it('round-trips filters back into a query string, omitting empty dimensions', () => {
        const filters = {
            statusIds: ['done'],
            tagIds: [],
            due: ['overdue', 'today'],
            created: [],
            memberIds: [],
        };
        expect(filtersToSearchString(filters)).toBe('status=done&due=overdue%2Ctoday');
    });
});

describe('countActiveFilters', () => {
    it('sums selected values across every dimension', () => {
        expect(
            countActiveFilters({
                statusIds: ['done', 'doing'],
                tagIds: ['urgent'],
                due: [],
                created: [],
                memberIds: [],
            }),
        ).toBe(3);
    });
});

describe('due-date bucket predicates', () => {
    it('isOverdue is true for a past due date on an incomplete task', () => {
        const task = { due_date: localDateDaysAgo(2), status_id: 'doing' };
        expect(isOverdue(task, DONE_STATUS_ID)).toBe(true);
    });

    it('isOverdue is false once the task is done', () => {
        const task = { due_date: localDateDaysAgo(2), status_id: DONE_STATUS_ID };
        expect(isOverdue(task, DONE_STATUS_ID)).toBe(false);
    });

    it('isDueToday matches only today', () => {
        expect(isDueToday({ due_date: localDateDaysAgo(0) })).toBe(true);
        expect(isDueToday({ due_date: localDateDaysAgo(1) })).toBe(false);
    });

    it('isDueThisWeek matches a date later this week', () => {
        const task = { due_date: localDateDaysAgo(-1) };
        // Only meaningful when "in 1 day" stays inside the current week - skip near week boundaries.
        const now = new Date();
        const dayOfWeek = now.getDay();
        if (dayOfWeek !== 0) {
            expect(isDueThisWeek(task)).toBe(true);
        }
    });

    it('hasNoDueDate is true only when due_date is falsy', () => {
        expect(hasNoDueDate({ due_date: null })).toBe(true);
        expect(hasNoDueDate({ due_date: '2025-01-01' })).toBe(false);
    });
});

describe('creation-date bucket predicates', () => {
    it('isCreatedToday matches a task created moments ago', () => {
        expect(isCreatedToday({ created_at: new Date().toISOString() })).toBe(true);
        expect(isCreatedToday({ created_at: isoDaysAgo(2) })).toBe(false);
    });

    it('isCreatedLast7Days matches a task created 6 days ago regardless of the calendar week', () => {
        expect(isCreatedLast7Days({ created_at: isoDaysAgo(6) })).toBe(true);
        expect(isCreatedLast7Days({ created_at: isoDaysAgo(8) })).toBe(false);
    });

    it('isCreatedThisWeek matches a task created 2 days ago', () => {
        const now = new Date();
        if (now.getDay() >= 2) {
            expect(isCreatedThisWeek({ created_at: isoDaysAgo(2) })).toBe(true);
        }
    });

    it('isCreatedThisMonth matches a task created earlier this month', () => {
        const now = new Date();
        if (now.getDate() > 1) {
            expect(isCreatedThisMonth({ created_at: isoDaysAgo(1) })).toBe(true);
        }
    });

    it('isCreatedOlderThanMonth is true past the 30-day rolling window', () => {
        expect(isCreatedOlderThanMonth({ created_at: isoDaysAgo(31) })).toBe(true);
        expect(isCreatedOlderThanMonth({ created_at: isoDaysAgo(1) })).toBe(false);
    });
});

describe('taskMatchesFilters', () => {
    const emptyFilters = { statusIds: [], tagIds: [], due: [], created: [], memberIds: [] };

    it('matches everything when no filters are active', () => {
        const task = { status_id: 'doing', tags: [], created_by: 'user-1' };
        expect(taskMatchesFilters(task, emptyFilters, { doneStatusId: DONE_STATUS_ID })).toBe(true);
    });

    it('ORs within a dimension - either selected status matches', () => {
        const filters = { ...emptyFilters, statusIds: ['done', 'doing'] };
        expect(
            taskMatchesFilters({ status_id: 'doing', tags: [] }, filters, {
                doneStatusId: DONE_STATUS_ID,
            }),
        ).toBe(true);
        expect(
            taskMatchesFilters({ status_id: 'todo', tags: [] }, filters, {
                doneStatusId: DONE_STATUS_ID,
            }),
        ).toBe(false);
    });

    it('ANDs across dimensions - status and tag must both match', () => {
        const filters = { ...emptyFilters, statusIds: ['doing'], tagIds: ['urgent'] };
        const matchingTask = { status_id: 'doing', tags: [{ id: 'urgent' }] };
        const wrongTagTask = { status_id: 'doing', tags: [{ id: 'other' }] };
        expect(taskMatchesFilters(matchingTask, filters, { doneStatusId: DONE_STATUS_ID })).toBe(
            true,
        );
        expect(taskMatchesFilters(wrongTagTask, filters, { doneStatusId: DONE_STATUS_ID })).toBe(
            false,
        );
    });

    it('filters by creator via memberIds', () => {
        const filters = { ...emptyFilters, memberIds: ['user-1'] };
        expect(
            taskMatchesFilters({ status_id: 'doing', tags: [], created_by: 'user-1' }, filters, {
                doneStatusId: null,
            }),
        ).toBe(true);
        expect(
            taskMatchesFilters({ status_id: 'doing', tags: [], created_by: 'user-2' }, filters, {
                doneStatusId: null,
            }),
        ).toBe(false);
    });
});
