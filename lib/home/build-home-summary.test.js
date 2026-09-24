import { describe, expect, it } from 'vitest';
import { buildHomeSummary, loadHomeSummary } from './build-home-summary';

const sampleLists = [
    { id: 'listA', name: 'Alpha', color: '#111', space_id: 's1', task_count: 4 },
    { id: 'listB', name: 'Beta', color: '#222', space_id: 's1', task_count: 1 },
];
const sampleSublists = [
    { id: 'subX', name: 'Sub X', color: '#333', list_id: 'listA' },
    { id: 'subY', name: 'Sub Y', color: null, list_id: 'listB' },
];

function makeTask(overrides) {
    return {
        id: 't',
        title: 'Task',
        parent_id: null,
        list_id: 'listA',
        sublist_id: null,
        is_prioritised: false,
        due_date: null,
        updated_at: '2026-01-01T00:00:00Z',
        statuses: { code: 'todo', name: 'To Do', color: '#999' },
        ...overrides,
    };
}

function buildSummaryWithSampleLists({ recentTasks = [], priorityCandidates = [] } = {}) {
    return buildHomeSummary({
        recentTasks,
        priorityCandidates,
        lists: sampleLists,
        sublists: sampleSublists,
    });
}

describe('buildHomeSummary', () => {
    it('returns empty sections for empty input', () => {
        expect(buildSummaryWithSampleLists()).toEqual({
            priorityTasks: [],
            recentTasks: [],
            recentLists: [],
            recentSublists: [],
        });
    });

    it('keeps starred tasks that are not done and drops done ones', () => {
        const summary = buildSummaryWithSampleLists({
            priorityCandidates: [
                makeTask({ id: 'open', is_prioritised: true }),
                makeTask({
                    id: 'finished',
                    is_prioritised: true,
                    statuses: { code: 'done', name: 'Done', color: '#0f0' },
                }),
            ],
        });
        expect(summary.priorityTasks.map((task) => task.id)).toEqual(['open']);
    });

    it('shows a starred task even when it is older than the scanned recent tasks', () => {
        const summary = buildSummaryWithSampleLists({
            recentTasks: [makeTask({ id: 'new' })],
            priorityCandidates: [makeTask({ id: 'old-star', is_prioritised: true })],
        });
        expect(summary.priorityTasks.map((task) => task.id)).toEqual(['old-star']);
    });

    it('caps priority tasks at 8 and recent tasks at 8, keeping newest-first order', () => {
        const manyTasks = Array.from({ length: 12 }, (_, index) =>
            makeTask({ id: `t${index}`, is_prioritised: true }),
        );
        const summary = buildSummaryWithSampleLists({
            recentTasks: manyTasks,
            priorityCandidates: manyTasks,
        });
        expect(summary.priorityTasks.map((task) => task.id)).toEqual(
            manyTasks.slice(0, 8).map((task) => task.id),
        );
        expect(summary.recentTasks).toHaveLength(8);
    });

    it('adds the list name and colour and the status to each task', () => {
        const [recentTask] = buildSummaryWithSampleLists({
            recentTasks: [makeTask({ id: 'x', list_id: 'listB' })],
        }).recentTasks;
        expect(recentTask).toMatchObject({
            id: 'x',
            list_name: 'Beta',
            list_color: '#222',
            status_name: 'To Do',
            status_color: '#999',
        });
    });

    it('skips tasks whose list is not visible', () => {
        const summary = buildSummaryWithSampleLists({
            recentTasks: [makeTask({ id: 'orphan', list_id: 'gone' })],
        });
        expect(summary.recentTasks).toEqual([]);
        expect(summary.recentLists).toEqual([]);
    });

    it('orders recent lists by their newest task, without repeats, carrying task_count', () => {
        const summary = buildSummaryWithSampleLists({
            recentTasks: [
                makeTask({ id: '1', list_id: 'listB' }),
                makeTask({ id: '2', list_id: 'listA' }),
                makeTask({ id: '3', list_id: 'listB' }),
            ],
        });
        expect(summary.recentLists.map((list) => list.id)).toEqual(['listB', 'listA']);
        expect(summary.recentLists[1].task_count).toBe(4);
    });

    it('bumps a sublist when a nested task under its root changes', () => {
        const summary = buildSummaryWithSampleLists({
            recentTasks: [
                makeTask({ id: 'child', parent_id: 'root', list_id: 'listA' }),
                makeTask({ id: 'root', list_id: 'listA', sublist_id: 'subX' }),
            ],
        });
        expect(summary.recentSublists).toEqual([
            { id: 'subX', name: 'Sub X', color: '#333', list_id: 'listA', list_name: 'Alpha' },
        ]);
    });

    it('ignores a nested task whose root was not fetched, without throwing', () => {
        const summary = buildSummaryWithSampleLists({
            recentTasks: [makeTask({ id: 'child', parent_id: 'missing-root' })],
        });
        expect(summary.recentSublists).toEqual([]);
    });

    it('does not loop forever on a parent cycle', () => {
        const summary = buildSummaryWithSampleLists({
            recentTasks: [
                makeTask({ id: 'a', parent_id: 'b' }),
                makeTask({ id: 'b', parent_id: 'a' }),
            ],
        });
        expect(summary.recentSublists).toEqual([]);
    });
});

describe('loadHomeSummary', () => {
    /**
     * Fake Supabase client where every query resolves to the given result, and query builders chain.
     *
     * @param {object} queryResult - What every awaited query resolves to.
     * @returns {object} Client with a `from` method.
     */
    function makeFakeSupabase(queryResult) {
        const queryBuilder = {
            select: () => queryBuilder,
            eq: () => queryBuilder,
            order: () => queryBuilder,
            limit: () => queryBuilder,
            then: (resolve) => resolve(queryResult),
        };
        return { from: () => queryBuilder };
    }

    it('returns a generic error, not database detail, when a query fails', async () => {
        const supabase = makeFakeSupabase({
            data: null,
            error: { code: '42501', message: 'secret table detail' },
        });
        const loadResult = await loadHomeSummary(supabase);
        expect(loadResult).toEqual({ data: null, error: 'Failed to load home' });
    });

    it('returns a generic error when the client throws', async () => {
        const loadResult = await loadHomeSummary({
            from: () => {
                throw new Error('network down');
            },
        });
        expect(loadResult).toEqual({ data: null, error: 'Failed to load home' });
    });

    it('returns the summary when every query succeeds', async () => {
        const supabase = makeFakeSupabase({ data: [], error: null });
        const loadResult = await loadHomeSummary(supabase);
        expect(loadResult.error).toBeNull();
        expect(loadResult.data).toEqual({
            priorityTasks: [],
            recentTasks: [],
            recentLists: [],
            recentSublists: [],
            generated_at: expect.any(String),
        });
    });
});
