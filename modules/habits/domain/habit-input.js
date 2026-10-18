import { sanitizeString, checkMaxLength, sanitizeRichText } from '@/lib/validation';
import {
    HABIT_COLOR_INVALID,
    HABIT_TITLE_REQUIRED,
    HABIT_TITLE_TOO_LONG,
    HABIT_DESCRIPTION_TOO_LONG,
    HABIT_INVALID_POLARITY,
    HABIT_INVALID_MEASURE_KIND,
    HABIT_TARGET_VALUE_REQUIRED,
    HABIT_TARGET_VALUE_INVALID,
    HABIT_TARGET_VALUE_NOT_ALLOWED,
    HABIT_UNIT_CODE_REQUIRED,
    HABIT_UNIT_CODE_INVALID,
    HABIT_UNIT_CODE_NOT_ALLOWED,
    HABIT_UNIT_CODE_TOO_LONG,
    HABIT_RECURRENCE_INVALID,
    HABIT_ENTRY_DATE_INVALID,
    HABIT_ENTRY_DATE_IN_FUTURE,
    HABIT_ENTRY_DATE_TOO_OLD,
    HABIT_ENTRY_VALUE_INVALID,
    HABIT_ENTRY_NOTE_TOO_LONG,
    HABIT_CATEGORY_NAME_REQUIRED,
    HABIT_CATEGORY_NAME_TOO_LONG,
    HABIT_POLARITY_MEASURE_MISMATCH,
} from '@/modules/habits/errors';
import { RECURRENCE_KINDS } from './recurrence';
import {
    isValidLocalDateString,
    isLocalDateAfter,
    isLocalDateBefore,
    addDaysToLocalDate,
} from './local-date';
import { isValidUnitCode, getUnitDimension } from './units';
import { getMeasure, MEASURE_KINDS } from './measures/index';

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 10000;
const CATEGORY_NAME_MAX_LENGTH = 200;
const NOTE_MAX_LENGTH = 2000;
export const DEFAULT_BACKFILL_WINDOW_DAYS = 30;

// What an <input type="color"> sends; anything else would reach a style attribute unchecked
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// Explicit allowlist, not { ...fields } - an unlisted field must never reach the update.
const HABIT_UPDATABLE_FIELD_NAMES = [
    'title',
    'description',
    'category_id',
    'color',
    'polarity',
    'measure_kind',
    'target_value',
    'unit_code',
    'recurrence',
    'started_on',
];

const HABIT_CATEGORY_UPDATABLE_FIELD_NAMES = ['name', 'color', 'position'];

/**
 * Cleans a habit title and checks it is present and short enough.
 *
 * @param {unknown} rawTitle - Title as sent by the client.
 * @returns {{ title?: string, error?: string, code?: string }} The cleaned title, or why it was rejected.
 */
export function checkHabitTitle(rawTitle) {
    const title = sanitizeString(rawTitle, true);
    if (!title) return { error: 'Title is required', code: HABIT_TITLE_REQUIRED };
    const lengthFailure = checkMaxLength(title, TITLE_MAX_LENGTH, 'Title', HABIT_TITLE_TOO_LONG);
    if (lengthFailure) return lengthFailure;
    return { title };
}

/**
 * Cleans a rich-text habit description and checks it is short enough.
 *
 * @param {unknown} rawDescription - Description HTML as sent by the client.
 * @returns {{ description?: string|null, error?: string, code?: string }} The safe HTML (null when
 *   empty), or why it was rejected.
 */
export function checkHabitDescription(rawDescription) {
    const description = sanitizeRichText(rawDescription);
    const lengthFailure = checkMaxLength(
        description,
        DESCRIPTION_MAX_LENGTH,
        'Description',
        HABIT_DESCRIPTION_TOO_LONG,
    );
    if (lengthFailure) return lengthFailure;
    return { description: description || null };
}

/**
 * Checks that a colour sent by the client is a `#rrggbb` value.
 *
 * @param {unknown} rawColor - Colour sent by the client.
 * @returns {{ error: string, code: string }|null} The refusal, or null when valid.
 */
export function checkHabitColor(rawColor) {
    if (typeof rawColor === 'string' && HEX_COLOR_PATTERN.test(rawColor)) return null;
    return { error: 'Color must be a hex value like #6b7280', code: HABIT_COLOR_INVALID };
}

/**
 * Checks that a polarity is one of the two the schema allows.
 *
 * @param {unknown} rawPolarity - Value sent by the client.
 * @returns {{ polarity?: 'build'|'quit', error?: string, code?: string }} The valid polarity, or why
 *   it was rejected.
 */
export function checkHabitPolarity(rawPolarity) {
    if (rawPolarity === 'build' || rawPolarity === 'quit') return { polarity: rawPolarity };
    return { error: "Polarity must be 'build' or 'quit'", code: HABIT_INVALID_POLARITY };
}

/**
 * Checks a polarity/measure_kind pair is a combination the app currently supports.
 * `quit` is binary-only for now - a "stay under a limit" quit habit is deferred (decision B4).
 *
 * @param {string} polarity - The habit's (already validated) polarity.
 * @param {string} measureKind - The habit's (already validated) measure kind.
 * @returns {{ error: string, code: string }|null} The refusal, or null when the pair is allowed.
 */
export function checkHabitPolarityMeasureCombination(polarity, measureKind) {
    if (polarity === 'quit' && measureKind !== 'binary') {
        return {
            error: 'A quit habit can only track yes/no for now',
            code: HABIT_POLARITY_MEASURE_MISMATCH,
        };
    }
    return null;
}

/**
 * Checks that a measure kind is one the strategy registry knows about.
 *
 * @param {unknown} rawMeasureKind - Value sent by the client.
 * @returns {{ measureKind?: string, error?: string, code?: string }} The valid measure kind, or why
 *   it was rejected.
 */
export function checkHabitMeasureKind(rawMeasureKind) {
    if (typeof rawMeasureKind === 'string' && MEASURE_KINDS.includes(rawMeasureKind)) {
        return { measureKind: rawMeasureKind };
    }
    return {
        error: `Measure must be one of: ${MEASURE_KINDS.join(', ')}`,
        code: HABIT_INVALID_MEASURE_KIND,
    };
}

/**
 * Checks a habit's target value against its measure kind - required for count/quantity/duration, barred for binary.
 *
 * @param {unknown} rawTargetValue - Value sent by the client.
 * @param {string} measureKind - The habit's (already validated) measure kind.
 * @returns {{ targetValue?: number|null, error?: string, code?: string }} The valid target, or why
 *   it was rejected.
 */
export function checkHabitTargetValue(rawTargetValue, measureKind) {
    const isProvided = rawTargetValue !== undefined && rawTargetValue !== null;

    if (measureKind === 'binary') {
        if (isProvided) {
            return {
                error: 'Binary habits cannot have a target value',
                code: HABIT_TARGET_VALUE_NOT_ALLOWED,
            };
        }
        return { targetValue: null };
    }

    if (!isProvided) {
        return { error: 'A target value is required', code: HABIT_TARGET_VALUE_REQUIRED };
    }
    const targetValue = Number(rawTargetValue);
    if (!Number.isFinite(targetValue) || targetValue <= 0) {
        return {
            error: 'Target value must be a positive number',
            code: HABIT_TARGET_VALUE_INVALID,
        };
    }
    return { targetValue };
}

const UNIT_CODE_MAX_LENGTH = 30;

/**
 * Which built-in unit dimensions each measure kind accepts - shared with the UI so the picker filters the same list.
 * A unit outside these isn't rejected outright - `checkHabitUnitCode` falls back to a custom, unconverted label.
 *
 * @type {Record<string, string[]>}
 */
export const UNIT_DIMENSIONS_BY_MEASURE_KIND = {
    quantity: ['distance'],
    duration: ['duration'],
};

/**
 * Checks a habit's unit code against its measure kind.
 * An unmatched value isn't rejected - it becomes a free-text custom unit (decision B3.1), stored as-is.
 *
 * @param {unknown} rawUnitCode - Value sent by the client.
 * @param {string} measureKind - The habit's (already validated) measure kind.
 * @returns {{ unitCode?: string|null, error?: string, code?: string }} The valid unit code, or why
 *   it was rejected.
 */
export function checkHabitUnitCode(rawUnitCode, measureKind) {
    const isProvided = rawUnitCode !== undefined && rawUnitCode !== null;
    const allowedDimensions = UNIT_DIMENSIONS_BY_MEASURE_KIND[measureKind];

    if (!allowedDimensions) {
        if (isProvided) {
            return {
                error: `${measureKind} habits cannot have a unit`,
                code: HABIT_UNIT_CODE_NOT_ALLOWED,
            };
        }
        return { unitCode: null };
    }

    if (!isProvided) {
        if (measureKind === 'duration') return { unitCode: null };
        return { error: 'A unit is required', code: HABIT_UNIT_CODE_REQUIRED };
    }
    if (isValidUnitCode(rawUnitCode)) {
        if (allowedDimensions.includes(getUnitDimension(rawUnitCode) ?? '')) {
            return { unitCode: rawUnitCode };
        }
        // A real but wrong-dimension code is rejected outright, not silently treated as free text.
        return { error: 'Unrecognised unit for this measure', code: HABIT_UNIT_CODE_INVALID };
    }

    const customUnit = sanitizeString(rawUnitCode, true);
    if (!customUnit) {
        return { error: 'Unrecognised unit for this measure', code: HABIT_UNIT_CODE_INVALID };
    }
    const lengthFailure = checkMaxLength(
        customUnit,
        UNIT_CODE_MAX_LENGTH,
        'Unit',
        HABIT_UNIT_CODE_TOO_LONG,
    );
    if (lengthFailure) return lengthFailure;
    return { unitCode: customUnit };
}

/** @type {Record<string, (rawRecurrence: Record<string, any>) => { recurrence: Record<string, any> }|null>} */
const RECURRENCE_CHECKERS = {
    daily: () => ({ recurrence: { kind: 'daily' } }),
    /** @param {Record<string, any>} rawRecurrence */
    weekdays: (rawRecurrence) => {
        const { days } = rawRecurrence;
        const isValidDays =
            Array.isArray(days) &&
            days.length > 0 &&
            days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);
        if (!isValidDays) return null;
        return { recurrence: { kind: 'weekdays', days: [...new Set(days)].sort() } };
    },
    /** @param {Record<string, any>} rawRecurrence */
    times_per_week: (rawRecurrence) => {
        const { count } = rawRecurrence;
        if (!Number.isInteger(count) || count < 1 || count > 7) return null;
        return { recurrence: { kind: 'times_per_week', count } };
    },
    /** @param {Record<string, any>} rawRecurrence */
    every_n_days: (rawRecurrence) => {
        const { n, anchor } = rawRecurrence;
        if (!Number.isInteger(n) || n < 1 || n > 365) return null;
        if (!isValidLocalDateString(anchor)) return null;
        return { recurrence: { kind: 'every_n_days', n, anchor } };
    },
};

/**
 * Validates a habit's recurrence rule against its kind's own shape.
 *
 * @param {unknown} rawRecurrence - Value sent by the client.
 * @returns {{ recurrence?: object, error?: string, code?: string }} The normalized rule, or why it
 *   was rejected.
 */
export function checkHabitRecurrence(rawRecurrence) {
    if (typeof rawRecurrence !== 'object' || rawRecurrence === null) {
        return { error: 'Recurrence is required', code: HABIT_RECURRENCE_INVALID };
    }
    /** @type {Record<string, any>} */
    const rule = rawRecurrence;
    const { kind } = rule;
    if (!RECURRENCE_KINDS.includes(kind)) {
        return {
            error: `Recurrence kind must be one of: ${RECURRENCE_KINDS.join(', ')}`,
            code: HABIT_RECURRENCE_INVALID,
        };
    }
    const checkedRecurrence = RECURRENCE_CHECKERS[kind](rule);
    if (!checkedRecurrence) {
        return { error: 'Recurrence rule is invalid', code: HABIT_RECURRENCE_INVALID };
    }
    return checkedRecurrence;
}

/**
 * Checks that a habit's start date is a real date and not in the future - it can't have due days before it exists.
 *
 * @param {unknown} rawStartedOn - Value sent by the client.
 * @param {string} todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 * @returns {{ startedOn?: string, error?: string, code?: string }} The valid start date, or why it
 *   was rejected.
 */
export function checkHabitStartedOn(rawStartedOn, todayLocalDate) {
    if (!isValidLocalDateString(rawStartedOn)) {
        return { error: 'Start date is invalid', code: HABIT_ENTRY_DATE_INVALID };
    }
    if (isLocalDateAfter(rawStartedOn, todayLocalDate)) {
        return { error: 'Start date cannot be in the future', code: HABIT_ENTRY_DATE_IN_FUTURE };
    }
    return { startedOn: rawStartedOn };
}

/**
 * Picks the allowlisted habit fields the client actually sent (an omitted field stays unset).
 *
 * @param {Record<string, any>} fields - Partial habit fields as sent by the client.
 * @returns {Record<string, any>} Only the allowlisted fields whose value is not undefined.
 */
export function pickHabitUpdates(fields) {
    /** @type {Record<string, any>} */
    const updates = {};
    for (const fieldName of HABIT_UPDATABLE_FIELD_NAMES) {
        if (fields[fieldName] !== undefined) updates[fieldName] = fields[fieldName];
    }
    return updates;
}

/**
 * Cleans a habit category name and checks it is present and short enough.
 *
 * @param {unknown} rawName - Name as sent by the client.
 * @returns {{ name?: string, error?: string, code?: string }} The cleaned name, or why it was
 *   rejected.
 */
export function checkHabitCategoryName(rawName) {
    const name = sanitizeString(rawName, true);
    if (!name) return { error: 'Category name is required', code: HABIT_CATEGORY_NAME_REQUIRED };
    const lengthFailure = checkMaxLength(
        name,
        CATEGORY_NAME_MAX_LENGTH,
        'Category name',
        HABIT_CATEGORY_NAME_TOO_LONG,
    );
    if (lengthFailure) return lengthFailure;
    return { name };
}

/**
 * Picks the allowlisted habit category fields the client actually sent.
 *
 * @param {Record<string, any>} fields - Partial category fields as sent by the client.
 * @returns {Record<string, any>} Only the allowlisted fields whose value is not undefined.
 */
export function pickHabitCategoryUpdates(fields) {
    /** @type {Record<string, any>} */
    const updates = {};
    for (const fieldName of HABIT_CATEGORY_UPDATABLE_FIELD_NAMES) {
        if (fields[fieldName] !== undefined) updates[fieldName] = fields[fieldName];
    }
    return updates;
}

/**
 * Checks a check-in's local date: real, not in the future, and within the back-fill window (decision 10).
 *
 * @param {unknown} rawLocalDate - Value sent by the client.
 * @param {string} todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 * @param {number} [backfillWindowDays] - How many days into the past a check-in may land.
 * @returns {{ localDate: string, error?: undefined, code?: undefined } |
 *   { localDate?: undefined, error: string, code: string }} The valid date, or why it was rejected.
 */
export function checkHabitEntryLocalDate(
    rawLocalDate,
    todayLocalDate,
    backfillWindowDays = DEFAULT_BACKFILL_WINDOW_DAYS,
) {
    if (!isValidLocalDateString(rawLocalDate)) {
        return { error: 'Date is invalid', code: HABIT_ENTRY_DATE_INVALID };
    }
    if (isLocalDateAfter(rawLocalDate, todayLocalDate)) {
        return { error: 'Date cannot be in the future', code: HABIT_ENTRY_DATE_IN_FUTURE };
    }
    const earliestAllowedDate = addDaysToLocalDate(todayLocalDate, -backfillWindowDays);
    if (isLocalDateBefore(rawLocalDate, earliestAllowedDate)) {
        return {
            error: `Date cannot be more than ${backfillWindowDays} days ago`,
            code: HABIT_ENTRY_DATE_TOO_OLD,
        };
    }
    return { localDate: rawLocalDate };
}

/**
 * Checks a check-in's value against the habit's measure kind.
 *
 * @param {unknown} rawValue - Value sent by the client.
 * @param {string} measureKind - The habit's measure kind.
 * @returns {{ value?: number, error?: string, code?: string }} The normalized value, or why it was
 *   rejected.
 */
export function checkHabitEntryValue(rawValue, measureKind) {
    if (!MEASURE_KINDS.includes(measureKind)) {
        return {
            error: 'Measure kind is invalid for this habit',
            code: HABIT_INVALID_MEASURE_KIND,
        };
    }
    const value = getMeasure(measureKind).normalizeValue(rawValue);
    if (value === null) {
        return { error: 'Value is invalid for this habit', code: HABIT_ENTRY_VALUE_INVALID };
    }
    return { value };
}

/**
 * Cleans a check-in's note and checks it is short enough.
 *
 * @param {unknown} rawNote - Note as sent by the client.
 * @returns {{ note?: string|null, error?: string, code?: string }} The cleaned note (null when
 *   empty), or why it was rejected.
 */
export function checkHabitEntryNote(rawNote) {
    const note = sanitizeString(rawNote, true);
    const lengthFailure = checkMaxLength(note, NOTE_MAX_LENGTH, 'Note', HABIT_ENTRY_NOTE_TOO_LONG);
    if (lengthFailure) return lengthFailure;
    return { note: note || null };
}
