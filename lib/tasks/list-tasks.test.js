import { describe, it, expect, vi } from 'vitest';
import { fetchListTasks } from './list-tasks';
import { SUPABASE_PAGE_SIZE } from '@/lib/supabase/fetch-all-rows';

/** Fake client whose `.range(from, to)` answers each page from `pageResults` in order. */
function clientWithPages(pageResults) {
    const rangeCalls = [];
    const queryBuilder = {
        select: () => queryBuilder,
        eq: () => queryBuilder,
        order: () => queryBuilder,
        range: (from, to) => {
            rangeCalls.push({ from, to });
            return Promise.resolve(pageResults[rangeCalls.length - 1]);
        },
    };
    return { supabase: { from: vi.fn(() => queryBuilder) }, rangeCalls };
}

function taskRows(rowCount) {
    return Array.from({ length: rowCount }, (_, index) => ({
        id: `task-${index}`,
        statuses: { name: 'Open', color: '#fff' },
        task_tags: [{ tags: { id: 't1', name: 'urgent', color: '#ff0000' } }],
    }));
}

describe('fetchListTasks', () => {
    it('flattens the status and tag joins onto each task', async () => {
        const { supabase } = clientWithPages([
            {
                data: [
                    {
                        id: 'a',
                        statuses: { name: 'Done', color: '#0f0' },
                        task_tags: [{ tags: { id: 't1', name: 'urgent', color: '#ff0000' } }],
                    },
                    { id: 'b', statuses: null, task_tags: null },
                ],
                error: null,
            },
        ]);

        const { data: listTasks } = await fetchListTasks(supabase, 'list-1');

        expect(listTasks[0]).toMatchObject({
            status_name: 'Done',
            status_color: '#0f0',
            tags: [{ id: 't1', name: 'urgent', color: '#ff0000' }],
        });
        expect(listTasks[1]).toMatchObject({ status_name: null, status_color: null, tags: [] });
    });

    it('returns every task of a list larger than the 1000 row cap', async () => {
        const { supabase, rangeCalls } = clientWithPages([
            { data: taskRows(SUPABASE_PAGE_SIZE), error: null },
            { data: taskRows(37), error: null },
        ]);

        const { data: listTasks, error } = await fetchListTasks(supabase, 'list-1');

        expect(error).toBeNull();
        expect(listTasks).toHaveLength(SUPABASE_PAGE_SIZE + 37);
        expect(rangeCalls).toHaveLength(2);
    });

    it('returns the query error instead of an empty list', async () => {
        const failure = { code: '42501', message: 'denied' };
        const { supabase } = clientWithPages([{ data: null, error: failure }]);

        const { data: listTasks, error } = await fetchListTasks(supabase, 'list-1');

        expect(listTasks).toBeNull();
        expect(error).toBe(failure);
    });
});
