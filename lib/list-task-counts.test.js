import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachTaskCounts } from './list-task-counts';
import { SERVER_LOAD_FAILED } from '@/lib/error-codes';

function clientReturning(rpcResult) {
    return { rpc: vi.fn().mockResolvedValue(rpcResult) };
}

describe('attachTaskCounts', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('asks the database for counts once and maps them onto each list', async () => {
        const supabase = clientReturning({
            data: [{ list_id: 'l1', task_count: 3 }],
            error: null,
        });

        const listsWithCounts = await attachTaskCounts(supabase, [{ id: 'l1' }, { id: 'l2' }]);

        expect(supabase.rpc).toHaveBeenCalledTimes(1);
        expect(supabase.rpc).toHaveBeenCalledWith('list_task_counts');
        expect(listsWithCounts).toEqual([
            { id: 'l1', task_count: 3 },
            { id: 'l2', task_count: 0 },
        ]);
    });

    it('converts bigint-as-string counts to numbers and handles counts past 1000', async () => {
        const supabase = clientReturning({
            data: [{ list_id: 'l1', task_count: '2500' }],
            error: null,
        });

        const [list] = await attachTaskCounts(supabase, [{ id: 'l1' }]);

        expect(list.task_count).toBe(2500);
    });

    it('gives every list zero when the database returns no rows', async () => {
        const supabase = clientReturning({ data: null, error: null });

        const listsWithCounts = await attachTaskCounts(supabase, [{ id: 'l1' }]);

        expect(listsWithCounts).toEqual([{ id: 'l1', task_count: 0 }]);
    });

    it('throws a generic error instead of showing zeros when the query fails', async () => {
        const supabase = clientReturning({
            data: null,
            error: { code: '42883', message: 'function does not exist' },
        });

        await expect(attachTaskCounts(supabase, [{ id: 'l1' }])).rejects.toThrow(
            SERVER_LOAD_FAILED,
        );
    });
});
