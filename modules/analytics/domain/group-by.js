/**
 * Shared grouping helpers for the KPI reducers - the grouping logic lives exactly once.
 */

/**
 * Groups habit entries by their habit id.
 *
 * @param {Array<Record<string, any>>} entries - All `habit_entries` rows in scope.
 * @returns {Map<string, Record<string, any>[]>} Entries keyed by `habit_id`.
 */
export function groupEntriesByHabitId(entries) {
    /** @type {Map<string, Record<string, any>[]>} */
    const entriesByHabitId = new Map();
    for (const entry of entries) {
        const habitEntries = entriesByHabitId.get(entry.habit_id) ?? [];
        habitEntries.push(entry);
        entriesByHabitId.set(entry.habit_id, habitEntries);
    }
    return entriesByHabitId;
}

/**
 * Groups time sessions by their habit id. A session with no `habit_id` (task-linked or
 * standalone) is skipped - it never gets a key, since no Habit Zone KPI covers it (decision 13).
 *
 * @param {Array<Record<string, any>>} sessions - All `time_sessions` rows in scope.
 * @returns {Map<string, Record<string, any>[]>} Sessions keyed by `habit_id`.
 */
export function groupSessionsByHabitId(sessions) {
    /** @type {Map<string, Record<string, any>[]>} */
    const sessionsByHabitId = new Map();
    for (const session of sessions) {
        if (!session.habit_id) continue;
        const habitSessions = sessionsByHabitId.get(session.habit_id) ?? [];
        habitSessions.push(session);
        sessionsByHabitId.set(session.habit_id, habitSessions);
    }
    return sessionsByHabitId;
}
