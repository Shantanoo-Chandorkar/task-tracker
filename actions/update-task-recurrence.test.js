import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';

const OWNER_ID = 'user-owner';
const FIXED_NOW = new Date('2026-01-01T12:00:00.000Z');

let fake;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => ({ id: OWNER_ID }) }));

/** One owned task that already made `spawnedCount` copies of a daily series limited to 5 occurrences. */
function buildTables({ isRecurring = true, spawnedCount = 3 } = {}) {
    return {
        spaces: [{ id: 'space-1', owner_id: OWNER_ID, require_due_date: false }],
        space_collaborators: [],
        lists: [{ id: 'list-1', space_id: 'space-1' }],
        tasks: [
            {
                id: 'task-1',
                list_id: 'list-1',
                parent_id: null,
                created_by: OWNER_ID,
                title: 'Water plants',
                is_recurring: isRecurring,
                recurrence_rule: { count: 5, freq: 'DAILY', interval: 1 },
                recurrence_spawned_count: spawnedCount,
            },
        ],
    };
}

async function updateTaskWith(fields, tablesOptions) {
    fake = createFakeSupabase({ tables: buildTables(tablesOptions), getCallerId: () => OWNER_ID });
    const { updateTask } = await import('./task-update-actions');
    const updateResult = await updateTask('task-1', fields);
    return {
        updateResult,
        taskUpdate: fake.updates.find(({ tableName }) => tableName === 'tasks'),
    };
}

describe('updateTask recurrence', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(FIXED_NOW);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('keeps the spawned count when the same rule is saved again, whatever its key order', async () => {
        const { updateResult, taskUpdate } = await updateTaskWith({
            title: 'Water plants',
            is_recurring: true,
            recurrence_rule: { freq: 'DAILY', interval: 1, count: 5 },
        });

        expect(updateResult.error).toBeNull();
        expect(taskUpdate.values).not.toHaveProperty('recurrence_spawned_count');
        // 5 occurrences minus 3 copies leaves 2, so one more copy is still due
        expect(taskUpdate.values.next_occurrence).toBe('2026-01-02T12:00:00.000Z');
    });

    it('does not restart an exhausted series when it is saved again unchanged', async () => {
        const { taskUpdate } = await updateTaskWith(
            {
                is_recurring: true,
                recurrence_rule: { freq: 'DAILY', interval: 1, count: 5 },
            },
            { spawnedCount: 4 },
        );

        expect(taskUpdate.values.next_occurrence).toBeNull();
        expect(taskUpdate.values).not.toHaveProperty('recurrence_spawned_count');
    });

    it('starts the count again when the rule is changed', async () => {
        const { taskUpdate } = await updateTaskWith({
            is_recurring: true,
            recurrence_rule: { freq: 'DAILY', interval: 1, count: 8 },
        });

        expect(taskUpdate.values.recurrence_spawned_count).toBe(0);
        expect(taskUpdate.values.next_occurrence).toBe('2026-01-02T12:00:00.000Z');
    });

    it('starts the count again when recurrence is switched back on', async () => {
        const { taskUpdate } = await updateTaskWith(
            {
                is_recurring: true,
                recurrence_rule: { freq: 'DAILY', interval: 1, count: 5 },
            },
            { isRecurring: false, spawnedCount: 4 },
        );

        expect(taskUpdate.values.recurrence_spawned_count).toBe(0);
        expect(taskUpdate.values.next_occurrence).toBe('2026-01-02T12:00:00.000Z');
    });

    it('clears the next date when recurrence is switched off', async () => {
        const { taskUpdate } = await updateTaskWith({ is_recurring: false });

        expect(taskUpdate.values.next_occurrence).toBeNull();
    });

    it('leaves every recurrence field alone when only the title changes', async () => {
        const { taskUpdate } = await updateTaskWith({ title: 'Water the plants' });

        expect(Object.keys(taskUpdate.values)).toEqual(['title']);
    });
});
