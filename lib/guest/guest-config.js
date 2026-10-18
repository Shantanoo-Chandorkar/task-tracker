// Fixed from the moment the guest is created; the purge job in migration 0014 uses the same 30 minutes
export const GUEST_SESSION_MINUTES = 30;

export const GUEST_LIMITS = {
    spaces: 1,
    lists: 3,
    sublists: 6,
    tasks: 60,
    statuses: 8,
    tags: 20,
    // Snake-case to match the Postgres table name raised in GUEST_LIMIT_REACHED:<table>, like every key above.
    habit_categories: 5,
    habits: 10,
    habit_entries: 100,
    timer_templates: 10,
    time_sessions: 50,
};

export const GUEST_SESSIONS_PER_IP_PER_HOUR = 5;
