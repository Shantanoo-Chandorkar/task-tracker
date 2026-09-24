import { describe, expect, it } from 'vitest';
import { buildGuestSeed, seedGuestSpace } from './seed-guest-space';
import { GUEST_LIMITS } from './guest-config';
import { FINITE_MAX_DEPTH } from '@/lib/config';

const NOW = new Date('2026-01-01T12:00:00.000Z');
const statusIdByCode = { todo: 's-todo', in_progress: 's-progress', done: 's-done' };
const seed = buildGuestSeed({ spaceId: 'space-1', statusIdByCode, now: NOW });

describe('buildGuestSeed', () => {
    it('stays inside the guest limits with room left for the guest to add their own', () => {
        expect(seed.lists.length).toBeLessThan(GUEST_LIMITS.lists);
        expect(seed.sublists.length).toBeLessThan(GUEST_LIMITS.sublists);
        expect(seed.tasks.length).toBeLessThan(GUEST_LIMITS.tasks / 2);
    });

    it('never nests deeper than the app allows, and each subtask sits one level under its parent', () => {
        const tasksById = new Map(seed.tasks.map((task) => [task.id, task]));
        for (const task of seed.tasks) {
            expect(task.depth).toBeLessThanOrEqual(FINITE_MAX_DEPTH);
            if (task.parent_id) expect(tasksById.get(task.parent_id).depth).toBe(task.depth - 1);
            else expect(task.depth).toBe(0);
        }
        expect(Math.max(...seed.tasks.map((task) => task.depth))).toBe(FINITE_MAX_DEPTH);
    });

    it('keeps every reference valid: subtasks share their parent list and have no sublist, roots point at real ones', () => {
        const listIds = new Set(seed.lists.map((list) => list.id));
        const sublistIds = new Set(seed.sublists.map((sublist) => sublist.id));
        const tasksById = new Map(seed.tasks.map((task) => [task.id, task]));

        for (const sublist of seed.sublists) expect(listIds.has(sublist.list_id)).toBe(true);
        for (const task of seed.tasks) {
            expect(listIds.has(task.list_id)).toBe(true);
            if (task.parent_id) {
                expect(task.list_id).toBe(tasksById.get(task.parent_id).list_id);
                expect(task.sublist_id).toBeNull();
            } else if (task.sublist_id) {
                expect(sublistIds.has(task.sublist_id)).toBe(true);
            }
        }
    });

    it('uses only the statuses it was given, and shows all three', () => {
        const usedStatusIds = new Set(seed.tasks.map((task) => task.status_id));
        expect([...usedStatusIds].sort()).toEqual(Object.values(statusIdByCode).sort());
    });

    it('gives siblings unique positions', () => {
        const positionKeys = seed.tasks.map(
            (task) => `${task.parent_id ?? `${task.list_id}:${task.sublist_id}`}|${task.position}`,
        );
        expect(new Set(positionKeys).size).toBe(positionKeys.length);
    });

    it('showcases starred, recurring, due-dated and described tasks', () => {
        expect(seed.tasks.some((task) => task.is_prioritised)).toBe(true);
        expect(seed.tasks.some((task) => task.due_date)).toBe(true);
        expect(seed.tasks.some((task) => task.description)).toBe(true);
        expect(seed.tasks.some((task) => task.is_recurring)).toBe(true);
    });

    it('schedules recurring tasks days ahead, so the daily cron never spawns copies inside a 30-minute guest', () => {
        const recurringTasks = seed.tasks.filter((task) => task.is_recurring);
        for (const task of recurringTasks) {
            expect(task.recurrence_rule).not.toBeNull();
            expect(Date.parse(task.next_occurrence) - NOW.getTime()).toBeGreaterThanOrEqual(
                24 * 60 * 60 * 1000,
            );
        }
        for (const task of seed.tasks.filter((sampleTask) => !sampleTask.is_recurring)) {
            expect(task.next_occurrence).toBeNull();
        }
    });

    it('gives every row its own id', () => {
        const allIds = [...seed.lists, ...seed.sublists, ...seed.tasks].map((row) => row.id);
        expect(new Set(allIds).size).toBe(allIds.length);
    });
});

describe('seedGuestSpace', () => {
    /**
     * Fake admin client recording inserts; `failOn` names a table whose insert should fail.
     *
     * @param {object} options
     * @param {string} [options.failOn] - Table name whose insert returns an error.
     * @param {object[]} [options.statusRows] - Rows the statuses lookup returns.
     * @returns {{ client: object, insertedTables: string[] }}
     */
    function makeFakeAdminClient({ failOn, statusRows } = {}) {
        const insertedTables = [];
        const defaultStatusRows = [
            { id: 's-todo', code: 'todo' },
            { id: 's-progress', code: 'in_progress' },
            { id: 's-done', code: 'done' },
        ];
        const client = {
            from: (table) => ({
                insert: async () => {
                    insertedTables.push(table);
                    return { error: failOn === table ? { message: 'boom' } : null };
                },
                select: () => ({
                    eq: async () => ({ data: statusRows ?? defaultStatusRows, error: null }),
                }),
            }),
        };
        return { client, insertedTables };
    }

    it('inserts the space, then lists, sublists and tasks, in that order', async () => {
        const { client, insertedTables } = makeFakeAdminClient();
        await seedGuestSpace(client, 'user-1');
        expect(insertedTables).toEqual(['spaces', 'lists', 'sublists', 'tasks']);
    });

    it('throws on the first failed insert and inserts nothing after it', async () => {
        const { client, insertedTables } = makeFakeAdminClient({ failOn: 'lists' });
        await expect(seedGuestSpace(client, 'user-1')).rejects.toThrow('lists insert failed');
        expect(insertedTables).toEqual(['spaces', 'lists']);
    });

    it('throws when the default statuses are missing', async () => {
        const { client } = makeFakeAdminClient({ statusRows: [] });
        await expect(seedGuestSpace(client, 'user-1')).rejects.toThrow('default statuses missing');
    });
});
