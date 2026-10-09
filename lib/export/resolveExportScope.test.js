import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveExportScope } from './resolveExportScope';
import { SUPABASE_PAGE_SIZE } from '@/lib/supabase/fetch-all-rows';
import { SERVER_LOAD_FAILED } from '@/lib/error-codes';

const SPACE_ROW = { id: 'space-1', name: 'Work' };
const LIST_ROW = { id: 'list-1', name: 'Sprint', space_id: 'space-1' };

function taskRows(rowCount) {
    return Array.from({ length: rowCount }, (_, index) => ({
        id: `task-${String(index).padStart(5, '0')}`,
        title: `Task ${index}`,
        list_id: 'list-1',
        parent_id: null,
        sublist_id: null,
        depth: 0,
        status_id: null,
    }));
}

/**
 * Stand-in client. `tasks` pages come from `allTasks` by `.range`; every other table answers from
 * `tableRows`, and a table named in `failingTables` answers with an error instead.
 */
function createFakeSupabase({ allTasks, failingTables = [] }) {
    const tableRows = {
        statuses: [],
        sublists: [],
        lists: [LIST_ROW],
        spaces: [SPACE_ROW],
    };
    return {
        from(tableName) {
            let rangeStart = null;
            let rangeEnd = null;
            const builder = {
                select: () => builder,
                eq: () => builder,
                in: () => builder,
                order: () => builder,
                range: (from, to) => {
                    rangeStart = from;
                    rangeEnd = to;
                    return builder;
                },
                single: async () => ({ data: tableRows[tableName][0], error: null }),
                then: (resolve) => {
                    if (failingTables.includes(tableName)) {
                        return resolve({
                            data: null,
                            error: { code: '57014', message: 'timeout' },
                        });
                    }
                    const rows =
                        tableName === 'tasks'
                            ? allTasks.slice(rangeStart, rangeEnd + 1)
                            : tableRows[tableName];
                    return resolve({ data: rows, error: null });
                },
            };
            return builder;
        },
    };
}

describe('resolveExportScope', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('exports every task of a list larger than the 1000 row cap', async () => {
        const taskCount = SUPABASE_PAGE_SIZE * 2 + 5;
        const supabase = createFakeSupabase({ allTasks: taskRows(taskCount) });

        const exportScope = await resolveExportScope(supabase, { type: 'list', id: 'list-1' });

        expect(exportScope.rows).toHaveLength(taskCount);
    });

    it('exports every task of a space larger than the 1000 row cap', async () => {
        const taskCount = SUPABASE_PAGE_SIZE + 1;
        const supabase = createFakeSupabase({ allTasks: taskRows(taskCount) });

        const exportScope = await resolveExportScope(supabase, { type: 'space', id: 'space-1' });

        expect(exportScope.rows).toHaveLength(taskCount);
    });

    it('fails instead of serving a file with no tasks when the task read fails', async () => {
        const supabase = createFakeSupabase({ allTasks: taskRows(3), failingTables: ['tasks'] });

        await expect(resolveExportScope(supabase, { type: 'list', id: 'list-1' })).rejects.toThrow(
            SERVER_LOAD_FAILED,
        );
    });

    it('fails instead of serving a file with blank status names when the status read fails', async () => {
        const supabase = createFakeSupabase({ allTasks: taskRows(3), failingTables: ['statuses'] });

        await expect(resolveExportScope(supabase, { type: 'list', id: 'list-1' })).rejects.toThrow(
            SERVER_LOAD_FAILED,
        );
    });
});
