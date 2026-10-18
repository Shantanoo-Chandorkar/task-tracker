import { describe, expect, it } from 'vitest';
import { groupEntriesByHabitId, groupSessionsByHabitId } from './group-by';

describe('groupEntriesByHabitId', () => {
    it('returns an empty map for an empty list', () => {
        expect(groupEntriesByHabitId([]).size).toBe(0);
    });

    it('groups entries from a single habit together', () => {
        const entries = [
            { habit_id: 'h1', local_date: '2026-10-01' },
            { habit_id: 'h1', local_date: '2026-10-02' },
        ];

        expect(groupEntriesByHabitId(entries).get('h1')).toEqual(entries);
    });

    it('keeps multiple habits in separate buckets', () => {
        const entryA = { habit_id: 'h1', local_date: '2026-10-01' };
        const entryB = { habit_id: 'h2', local_date: '2026-10-01' };

        const entriesByHabitId = groupEntriesByHabitId([entryA, entryB]);

        expect(entriesByHabitId.get('h1')).toEqual([entryA]);
        expect(entriesByHabitId.get('h2')).toEqual([entryB]);
    });
});

describe('groupSessionsByHabitId', () => {
    it('returns an empty map for an empty list', () => {
        expect(groupSessionsByHabitId([]).size).toBe(0);
    });

    it('groups sessions from a single habit together', () => {
        const sessions = [
            { habit_id: 'h1', task_id: null },
            { habit_id: 'h1', task_id: null },
        ];

        expect(groupSessionsByHabitId(sessions).get('h1')).toEqual(sessions);
    });

    it('keeps multiple habits in separate buckets', () => {
        const sessionA = { habit_id: 'h1', task_id: null };
        const sessionB = { habit_id: 'h2', task_id: null };

        const sessionsByHabitId = groupSessionsByHabitId([sessionA, sessionB]);

        expect(sessionsByHabitId.get('h1')).toEqual([sessionA]);
        expect(sessionsByHabitId.get('h2')).toEqual([sessionB]);
    });

    it('excludes task-linked sessions - they never get a habit_id key', () => {
        const taskSession = { habit_id: null, task_id: 't1' };

        const sessionsByHabitId = groupSessionsByHabitId([taskSession]);

        expect(sessionsByHabitId.size).toBe(0);
    });

    it('excludes standalone sessions - no habit_id, no task_id', () => {
        const standaloneSession = { habit_id: null, task_id: null, label: 'Reading' };

        const sessionsByHabitId = groupSessionsByHabitId([standaloneSession]);

        expect(sessionsByHabitId.size).toBe(0);
    });
});
