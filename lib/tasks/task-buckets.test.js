import { describe, expect, it } from 'vitest';
import { buildTaskBuckets, countTasksByStatusId, describeBucketBreakdown } from './task-buckets';
import { EMPTY_TASK_FILTERS } from './task-filters';
import { flatToTree } from './task-tree';

const STATUSES = [
    { id: 'todo', name: 'To do' },
    { id: 'doing', name: 'Doing' },
    { id: 'done', name: 'Done' },
];

function task(id, overrides = {}) {
    return { id, parent_id: null, sublist_id: null, status_id: 'todo', ...overrides };
}

const flatList = [
    task('a'),
    task('b', { status_id: 'done' }),
    task('c', { status_id: null }),
    task('a1', { parent_id: 'a', status_id: 'doing' }),
    task('e', { sublist_id: 's1' }),
    task('e1', { parent_id: 'e', status_id: 'doing' }),
];
const sublists = [{ id: 's1' }, { id: 's2' }];

function buildBuckets(overrides = {}) {
    return buildTaskBuckets({
        rootTasks: flatToTree(flatList),
        flatList,
        sublists,
        filters: EMPTY_TASK_FILTERS,
        hasActiveFilters: false,
        doneStatusId: 'done',
        ...overrides,
    });
}

describe('countTasksByStatusId', () => {
    it('counts tasks of every depth, with 0 for an unused status', () => {
        expect(countTasksByStatusId(STATUSES, flatList)).toEqual({ todo: 2, doing: 2, done: 1 });
    });

    it('ignores tasks with no status or an unknown one', () => {
        const counts = countTasksByStatusId(STATUSES, [task('x', { status_id: null })]);

        expect(counts).toEqual({ todo: 0, doing: 0, done: 0 });
    });

    it('is empty when there are no statuses', () => {
        expect(countTasksByStatusId([], flatList)).toEqual({});
    });
});

describe('describeBucketBreakdown', () => {
    it('lists the most populous status first, names in capitals', () => {
        const counts = new Map([
            ['todo', 1],
            ['doing', 3],
        ]);

        expect(describeBucketBreakdown(counts, STATUSES)).toBe('3 DOING · 1 TO DO');
    });

    it('leaves out statuses with no tasks, and is empty when nothing matches', () => {
        expect(describeBucketBreakdown(new Map([['done', 2]]), STATUSES)).toBe('2 DONE');
        expect(describeBucketBreakdown(new Map(), STATUSES)).toBe('');
    });
});

describe('buildTaskBuckets', () => {
    it('gives the main list first, then one bucket per sublist in order', () => {
        const buckets = buildBuckets();

        expect(buckets.map((bucket) => bucket.key)).toEqual(['direct', 's1', 's2']);
        expect(buckets[0].sublist).toBeNull();
        expect(buckets[1].sublist).toBe(sublists[0]);
    });

    it('puts root tasks without a sublist in the main list and the others in their sublist', () => {
        const [direct, sprint, backlog] = buildBuckets();

        expect(direct.tasks.map((rootTask) => rootTask.id)).toEqual(['a', 'b', 'c']);
        expect(sprint.tasks.map((rootTask) => rootTask.id)).toEqual(['e']);
        expect(backlog.tasks).toEqual([]);
    });

    it('groups a bucket by status, with "none" for tasks without one', () => {
        const [direct] = buildBuckets();

        expect([...direct.tasksByStatusId.keys()]).toEqual(['todo', 'done', 'none']);
        expect(direct.tasksByStatusId.get('todo').map((rootTask) => rootTask.id)).toEqual(['a']);
    });

    it('counts every depth in the totals, each task under its own status', () => {
        const [direct, sprint] = buildBuckets();

        expect(direct.allDepthCount).toBe(4);
        expect(Object.fromEntries(direct.allDepthCountsByStatusId)).toEqual({
            todo: 1,
            doing: 1,
            done: 1,
            none: 1,
        });
        expect(sprint.allDepthCount).toBe(2);
        expect(Object.fromEntries(sprint.allDepthCountsByStatusId)).toEqual({ todo: 1, doing: 1 });
    });

    it('keeps every root task when no filter is active', () => {
        const buckets = buildBuckets({ filters: undefined });

        expect(buckets[0].tasks).toHaveLength(3);
    });
});

describe('buildTaskBuckets with filters', () => {
    const doingFilters = { ...EMPTY_TASK_FILTERS, statusIds: ['doing'] };

    it('keeps a root task when a subtask matches, and drops roots with no match', () => {
        const buckets = buildBuckets({ filters: doingFilters, hasActiveFilters: true });

        expect(buckets[0].tasks.map((rootTask) => rootTask.id)).toEqual(['a']);
        expect(buckets[1].tasks.map((rootTask) => rootTask.id)).toEqual(['e']);
    });

    it('counts all of a kept root task’s descendants, matching or not', () => {
        const buckets = buildBuckets({ filters: doingFilters, hasActiveFilters: true });

        expect(buckets[0].allDepthCount).toBe(2);
    });

    it('leaves a sublist with nothing matching as an empty bucket, not a missing one', () => {
        const buckets = buildBuckets({ filters: doingFilters, hasActiveFilters: true });

        expect(buckets).toHaveLength(3);
        expect(buckets[2].tasks).toEqual([]);
        expect(buckets[2].allDepthCount).toBe(0);
    });
});
