import {
    startOfDay,
    endOfDay,
    startOfWeek,
    endOfWeek,
    subDays,
    isWithinInterval,
    isBefore,
    parseISO,
} from 'date-fns';

const WEEK_STARTS_ON_MONDAY = { weekStartsOn: 1 };
const OLDER_THAN_DAYS = 30;

const FILTER_DIMENSIONS = ['statusIds', 'tagIds', 'due', 'created', 'memberIds'];
const URL_PARAM_BY_DIMENSION = {
    statusIds: 'status',
    tagIds: 'tag',
    due: 'due',
    created: 'created',
    memberIds: 'member',
};

export const EMPTY_TASK_FILTERS = {
    statusIds: [],
    tagIds: [],
    due: [],
    created: [],
    memberIds: [],
};

export const DUE_BUCKETS = [
    { value: 'overdue', label: 'Overdue' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'none', label: 'No due date' },
];

export const CREATED_BUCKETS = [
    { value: 'today', label: 'Today' },
    { value: 'last7days', label: 'Last 7 days' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    { value: 'older', label: 'Older than a month' },
];

/**
 * Reads task-list filter state out of the current URL's search params.
 *
 * @param {URLSearchParams} searchParams - The list page's current search params
 * @returns {{statusIds: string[], tagIds: string[], due: string[], created: string[], memberIds: string[]}}
 */
export function parseTaskFilters(searchParams) {
    const filters = {};
    for (const dimension of FILTER_DIMENSIONS) {
        const raw = searchParams.get(URL_PARAM_BY_DIMENSION[dimension]);
        filters[dimension] = raw ? raw.split(',').filter(Boolean) : [];
    }
    return filters;
}

/**
 * Builds the query string for a filters object, omitting any empty dimension.
 *
 * @param {object} filters - Same shape as `parseTaskFilters` returns
 * @returns {string} Query string, e.g. "status=done&tag=urgent" (no leading "?")
 */
export function filtersToSearchString(filters) {
    const params = new URLSearchParams();
    for (const dimension of FILTER_DIMENSIONS) {
        const values = filters[dimension] ?? [];
        if (values.length > 0) params.set(URL_PARAM_BY_DIMENSION[dimension], values.join(','));
    }
    return params.toString();
}

/**
 * Total number of individually selected filter values across every dimension.
 *
 * @param {object} filters - Same shape as `parseTaskFilters` returns
 * @returns {number} Count shown as the filter sheet trigger's badge
 */
export function countActiveFilters(filters) {
    return FILTER_DIMENSIONS.reduce(
        (total, dimension) => total + (filters[dimension]?.length ?? 0),
        0,
    );
}

/**
 * Whether a task falls in the "overdue" bucket - has a due date in the past and isn't done.
 *
 * @param {object} task - Task with a `due_date` and `status_id`
 * @param {string|null} doneStatusId - The space's "done" status id, or null if unconfigured
 * @returns {boolean}
 */
export function isOverdue(task, doneStatusId) {
    if (!task.due_date) return false;
    if (doneStatusId && task.status_id === doneStatusId) return false;
    return isBefore(parseISO(task.due_date), startOfDay(new Date()));
}

/**
 * Whether a task's due date is today.
 *
 * @param {object} task - Task with a `due_date`
 * @returns {boolean}
 */
export function isDueToday(task) {
    if (!task.due_date) return false;
    const today = new Date();
    return isWithinInterval(parseISO(task.due_date), {
        start: startOfDay(today),
        end: endOfDay(today),
    });
}

/**
 * Whether a task's due date falls within the current week (Monday-Sunday).
 *
 * @param {object} task - Task with a `due_date`
 * @returns {boolean}
 */
export function isDueThisWeek(task) {
    if (!task.due_date) return false;
    const now = new Date();
    return isWithinInterval(parseISO(task.due_date), {
        start: startOfWeek(now, WEEK_STARTS_ON_MONDAY),
        end: endOfWeek(now, WEEK_STARTS_ON_MONDAY),
    });
}

/**
 * Whether a task has no due date set.
 *
 * @param {object} task - Task with a `due_date`
 * @returns {boolean}
 */
export function hasNoDueDate(task) {
    return !task.due_date;
}

/**
 * Whether a task was created today.
 *
 * @param {object} task - Task with a `created_at`
 * @returns {boolean}
 */
export function isCreatedToday(task) {
    if (!task.created_at) return false;
    const today = new Date();
    return isWithinInterval(parseISO(task.created_at), {
        start: startOfDay(today),
        end: endOfDay(today),
    });
}

/**
 * Whether a task was created in the last 7 days - a rolling window, not a calendar-week boundary.
 *
 * @param {object} task - Task with a `created_at`
 * @returns {boolean}
 */
export function isCreatedLast7Days(task) {
    if (!task.created_at) return false;
    return isWithinInterval(parseISO(task.created_at), {
        start: subDays(new Date(), 7),
        end: new Date(),
    });
}

/**
 * Whether a task was created within the current week (Monday-Sunday).
 *
 * @param {object} task - Task with a `created_at`
 * @returns {boolean}
 */
export function isCreatedThisWeek(task) {
    if (!task.created_at) return false;
    const now = new Date();
    return isWithinInterval(parseISO(task.created_at), {
        start: startOfWeek(now, WEEK_STARTS_ON_MONDAY),
        end: endOfWeek(now, WEEK_STARTS_ON_MONDAY),
    });
}

/**
 * Whether a task was created within the current calendar month.
 *
 * @param {object} task - Task with a `created_at`
 * @returns {boolean}
 */
export function isCreatedThisMonth(task) {
    if (!task.created_at) return false;
    const createdAt = parseISO(task.created_at);
    const now = new Date();
    return createdAt.getFullYear() === now.getFullYear() && createdAt.getMonth() === now.getMonth();
}

/**
 * Whether a task is older than a fixed 30-day rolling window - not a calendar-month boundary.
 *
 * @param {object} task - Task with a `created_at`
 * @returns {boolean}
 */
export function isCreatedOlderThanMonth(task) {
    if (!task.created_at) return false;
    return isBefore(parseISO(task.created_at), subDays(new Date(), OLDER_THAN_DAYS));
}

const DUE_BUCKET_PREDICATES = {
    overdue: isOverdue,
    today: isDueToday,
    week: isDueThisWeek,
    none: (task) => hasNoDueDate(task),
};

const CREATED_BUCKET_PREDICATES = {
    today: isCreatedToday,
    last7days: isCreatedLast7Days,
    week: isCreatedThisWeek,
    month: isCreatedThisMonth,
    older: isCreatedOlderThanMonth,
};

/**
 * Whether a single task matches every active filter dimension (AND across dimensions, OR within).
 * A dimension with no values selected always passes.
 *
 * @param {object} task - Task to test (status_id, tags, due_date, created_at, created_by)
 * @param {object} filters - Same shape as `parseTaskFilters` returns
 * @param {object} context
 * @param {string|null} context.doneStatusId - The space's "done" status id, for the overdue bucket
 * @returns {boolean}
 */
export function taskMatchesFilters(task, filters, { doneStatusId }) {
    if (filters.statusIds.length > 0 && !filters.statusIds.includes(task.status_id)) {
        return false;
    }

    if (filters.tagIds.length > 0) {
        const taskTagIds = (task.tags ?? []).map((tag) => tag.id);
        if (!filters.tagIds.some((tagId) => taskTagIds.includes(tagId))) return false;
    }

    if (filters.memberIds.length > 0 && !filters.memberIds.includes(task.created_by)) {
        return false;
    }

    if (filters.due.length > 0) {
        const matchesAnyDueBucket = filters.due.some((bucket) =>
            DUE_BUCKET_PREDICATES[bucket]?.(task, doneStatusId),
        );
        if (!matchesAnyDueBucket) return false;
    }

    if (filters.created.length > 0) {
        const matchesAnyCreatedBucket = filters.created.some((bucket) =>
            CREATED_BUCKET_PREDICATES[bucket]?.(task),
        );
        if (!matchesAnyCreatedBucket) return false;
    }

    return true;
}
