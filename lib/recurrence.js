import { RRule } from 'rrule';

/**
 * Maps the stored JSONB frequency strings to rrule frequency constants.
 * rrule uses numeric constants (0=YEARLY, 1=MONTHLY, 2=WEEKLY, 3=DAILY).
 */
const FREQ_MAP = {
    DAILY: RRule.DAILY,
    WEEKLY: RRule.WEEKLY,
    MONTHLY: RRule.MONTHLY,
    YEARLY: RRule.YEARLY,
};

/**
 * Maps weekday strings to rrule weekday objects.
 */
const WEEKDAY_MAP = {
    MO: RRule.MO,
    TU: RRule.TU,
    WE: RRule.WE,
    TH: RRule.TH,
    FR: RRule.FR,
    SA: RRule.SA,
    SU: RRule.SU,
};

/**
 * Builds an RRule instance from the stored JSONB rule object.
 *
 * @param {object} ruleJson - Stored recurrence rule from the database
 * @param {string} ruleJson.freq - Frequency string ('DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY')
 * @param {number} [ruleJson.interval] - Interval between recurrences
 * @param {string[]} [ruleJson.byweekday] - Days of the week for weekly rules
 * @param {number} [ruleJson.count] - Maximum number of occurrences
 * @param {string} [ruleJson.until] - ISO date string for end date
 * @param {number} [spawnedCount] - Copies already made, taken off `count` since the rule has no start date
 * @returns {RRule} Configured RRule instance
 */
function buildRRule(ruleJson, spawnedCount = 0) {
    const options = {
        freq: FREQ_MAP[ruleJson.freq] ?? RRule.DAILY,
        interval: ruleJson.interval ?? 1,
    };

    if (ruleJson.byweekday && ruleJson.byweekday.length > 0) {
        options.byweekday = ruleJson.byweekday.map((day) => WEEKDAY_MAP[day]).filter(Boolean);
    }

    if (ruleJson.count) {
        options.count = Math.max(ruleJson.count - spawnedCount, 1);
    } else if (ruleJson.until) {
        options.until = new Date(ruleJson.until);
    }

    return new RRule(options);
}

/**
 * Computes the next occurrence date for a recurring task after the current moment.
 *
 * @param {object} ruleJson - Stored recurrence rule from the database
 * @param {number} [spawnedCount] - Copies already made; with a `count` rule the original task is occurrence one
 * @returns {Date|null} Next occurrence date, or null if no future occurrences exist
 */
export function computeNextOccurrence(ruleJson, spawnedCount = 0) {
    if (!ruleJson) return null;
    try {
        const rule = buildRRule(ruleJson, spawnedCount);
        return rule.after(new Date());
    } catch {
        return null;
    }
}

/**
 * Whether two stored recurrence rules describe the same schedule, ignoring key order
 * (Postgres jsonb reorders keys, so a plain string comparison would call equal rules different).
 *
 * @param {object|null|undefined} firstRule - One rule, or none
 * @param {object|null|undefined} secondRule - The other rule, or none
 * @returns {boolean} True when both are missing or both have the same keys and values
 */
export function recurrenceRulesMatch(firstRule, secondRule) {
    const canonicalJson = (rule) =>
        JSON.stringify(rule ?? null, (_key, value) =>
            value && typeof value === 'object' && !Array.isArray(value)
                ? Object.fromEntries(
                      Object.entries(value).sort(([firstKey], [secondKey]) =>
                          firstKey.localeCompare(secondKey),
                      ),
                  )
                : value,
        );
    return canonicalJson(firstRule) === canonicalJson(secondRule);
}

/**
 * Returns a human-readable English description of the recurrence rule.
 * Example: "every week on Monday, Wednesday"
 *
 * @param {object} ruleJson - Stored recurrence rule from the database
 * @returns {string} Human-readable label, or empty string if rule is invalid
 */
export function humanReadableLabel(ruleJson) {
    if (!ruleJson) return '';
    try {
        const rule = buildRRule(ruleJson);
        return rule.toText();
    } catch {
        return '';
    }
}

const FREQUENCY_LABEL_BY_CODE = {
    DAILY: 'Daily',
    WEEKLY: 'Weekly',
    MONTHLY: 'Monthly',
    YEARLY: 'Yearly',
};

/**
 * Returns the one-word frequency name for a recurrence rule, for compact pills.
 *
 * @param {object} ruleJson - Stored recurrence rule from the database
 * @returns {string} 'Daily' | 'Weekly' | 'Monthly' | 'Yearly', or empty string if the rule is missing or unknown
 */
export function recurrenceFrequencyLabel(ruleJson) {
    return FREQUENCY_LABEL_BY_CODE[ruleJson?.freq] ?? '';
}
