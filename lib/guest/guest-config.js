// Fixed from the moment the guest is created; the purge job in migration 0014 uses the same 30 minutes
export const GUEST_SESSION_MINUTES = 30;

export const GUEST_LIMITS = {
    spaces: 1,
    lists: 3,
    sublists: 6,
    tasks: 60,
    statuses: 8,
};

export const GUEST_SESSIONS_PER_IP_PER_HOUR = 5;
