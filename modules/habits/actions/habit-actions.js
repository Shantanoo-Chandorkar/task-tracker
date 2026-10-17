'use server';

import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { readClientId, findOwnRowById, insertRowOnce } from '@/lib/idempotent-create';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import {
    checkHabitTitle,
    checkHabitDescription,
    checkHabitColor,
    checkHabitPolarity,
    checkHabitMeasureKind,
    checkHabitTargetValue,
    checkHabitUnitCode,
    checkHabitRecurrence,
    checkHabitStartedOn,
} from '@/modules/habits/domain/habit-input';
import {
    DEFAULT_HABIT_COLOR,
    DEFAULT_HABIT_POLARITY,
    DEFAULT_HABIT_MEASURE_KIND,
    DEFAULT_HABIT_RECURRENCE,
} from '@/modules/habits/habit-limits';
import {
    HABIT_ID_REQUIRED,
    HABIT_NOT_FOUND,
    HABIT_CATEGORY_NOT_FOUND,
} from '@/modules/habits/errors';
import { getNextPosition } from '@/modules/habits/data/append-position';
import { loadHabitForWrite } from '@/modules/habits/data/load-habit-for-write';
import { findOwnHabitCategoryById } from '@/modules/habits/data/find-own-habit-category';
import { resolveUserTodayLocalDate } from '@/modules/habits/data/resolve-user-local-date';

const ID_REQUIRED_FAILURE = { error: 'Habit ID is required', code: HABIT_ID_REQUIRED };
const NOT_FOUND_FAILURE = { error: 'Habit not found', code: HABIT_NOT_FOUND };
const CATEGORY_NOT_FOUND_FAILURE = { error: 'Category not found', code: HABIT_CATEGORY_NOT_FOUND };

/**
 * Checks a habit's `category_id` belongs to the caller - the foreign key alone doesn't prove ownership.
 *
 * @param {SupabaseClient} supabase - Request-scoped Supabase client.
 * @param {unknown} categoryId - Value sent by the client.
 * @returns {Promise<{ categoryId: string|null, failure?: undefined}|{ failure: Record<string, any> }>}
 */
async function checkOwnCategoryId(supabase, categoryId) {
    if (categoryId === undefined || categoryId === null) return { categoryId: null };
    if (typeof categoryId !== 'string') return { failure: CATEGORY_NOT_FOUND_FAILURE };
    const ownedCategory = await findOwnHabitCategoryById(supabase, categoryId);
    if (!ownedCategory) return { failure: CATEGORY_NOT_FOUND_FAILURE };
    return { categoryId };
}

/**
 * Validates every field a habit create sends; anything omitted falls back to the schema's own default.
 *
 * @param {Record<string, any>} fields - Fields sent by the client.
 * @param {string} todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 * @returns {{ failure: Record<string, any> }|{ failure?: undefined, values: Record<string, any> }}
 */
function validateHabitCreateFields(fields, todayLocalDate) {
    const titleCheck = checkHabitTitle(fields.title);
    if (titleCheck.error) return { failure: { error: titleCheck.error, code: titleCheck.code } };

    const descriptionCheck = checkHabitDescription(fields.description);
    if (descriptionCheck.error) {
        return { failure: { error: descriptionCheck.error, code: descriptionCheck.code } };
    }

    const colorFailure = fields.color == null ? null : checkHabitColor(fields.color);
    if (colorFailure) return { failure: colorFailure };

    let polarity = DEFAULT_HABIT_POLARITY;
    if (fields.polarity !== undefined) {
        const polarityCheck = checkHabitPolarity(fields.polarity);
        if (polarityCheck.error) {
            return { failure: { error: polarityCheck.error, code: polarityCheck.code } };
        }
        // Only the error branch lacks `polarity`, but it's an optional sibling property, not a discriminated union
        polarity = polarityCheck.polarity ?? polarity;
    }

    let measureKind = DEFAULT_HABIT_MEASURE_KIND;
    if (fields.measure_kind !== undefined) {
        const measureKindCheck = checkHabitMeasureKind(fields.measure_kind);
        if (measureKindCheck.error) {
            return { failure: { error: measureKindCheck.error, code: measureKindCheck.code } };
        }
        measureKind = measureKindCheck.measureKind ?? measureKind;
    }

    const targetValueCheck = checkHabitTargetValue(fields.target_value, measureKind);
    if (targetValueCheck.error) {
        return { failure: { error: targetValueCheck.error, code: targetValueCheck.code } };
    }

    const unitCodeCheck = checkHabitUnitCode(fields.unit_code, measureKind);
    if (unitCodeCheck.error) {
        return { failure: { error: unitCodeCheck.error, code: unitCodeCheck.code } };
    }

    /** @type {Record<string, any>} */
    let recurrence = DEFAULT_HABIT_RECURRENCE;
    if (fields.recurrence !== undefined) {
        const recurrenceCheck = checkHabitRecurrence(fields.recurrence);
        if (recurrenceCheck.error) {
            return { failure: { error: recurrenceCheck.error, code: recurrenceCheck.code } };
        }
        recurrence = recurrenceCheck.recurrence ?? recurrence;
    }

    const startedOnCheck = checkHabitStartedOn(fields.started_on ?? todayLocalDate, todayLocalDate);
    if (startedOnCheck.error) {
        return { failure: { error: startedOnCheck.error, code: startedOnCheck.code } };
    }

    return {
        values: {
            title: titleCheck.title,
            description: descriptionCheck.description,
            color: fields.color ?? DEFAULT_HABIT_COLOR,
            polarity,
            measure_kind: measureKind,
            target_value: targetValueCheck.targetValue,
            unit_code: unitCodeCheck.unitCode,
            recurrence,
            started_on: startedOnCheck.startedOn,
        },
    };
}

/**
 * Creates a habit at the end of the caller's own order; a client-id retry returns the first row.
 *
 * @param {object} fields - Fields to validate; all but `title` default when omitted (see the two helpers above).
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const createHabit = withAuthenticatedAction(
    '[habits] create',
    'Unexpected error creating habit',
    async (user, supabase, fields) => {
        const clientId = readClientId(fields);
        if (clientId.failure) return { data: null, ...clientId.failure };
        const replayedHabit = await findOwnRowById(
            supabase,
            'habits',
            clientId.id,
            'user_id',
            user.id,
        );
        if (replayedHabit) return { data: replayedHabit, error: null };

        const todayLocalDate = await resolveUserTodayLocalDate(supabase, user.id);
        const validatedFields = validateHabitCreateFields(fields, todayLocalDate);
        if (validatedFields.failure) return { data: null, ...validatedFields.failure };
        const { values } = validatedFields;

        const categoryCheck = await checkOwnCategoryId(supabase, fields.category_id);
        if (categoryCheck.failure) return { data: null, ...categoryCheck.failure };

        const position = await getNextPosition(supabase, 'habits', { user_id: user.id });
        const { data: createdHabit, error } = await insertRowOnce(
            supabase,
            'habits',
            { ...values, category_id: categoryCheck.categoryId, position, user_id: user.id },
            { clientId: clientId.id, ownerColumn: 'user_id', userId: user.id },
        );
        if (error) {
            const guestLimitResult = toGuestLimitResult(error);
            if (guestLimitResult) return { data: null, ...guestLimitResult };
            return { data: null, error: 'Failed to create habit' };
        }

        return { data: createdHabit, error: null };
    },
);

/**
 * Updates a habit's sent fields; `target_value`/`unit_code` are re-checked against the new or existing measure_kind.
 *
 * @param {string} id - Habit to update.
 * @param {Record<string, any>} fields - Partial fields; see `validateHabitCreateFields`'s field set.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const updateHabit = withAuthenticatedAction(
    '[habits] update',
    'Unexpected error updating habit',
    async (user, supabase, id, fields) => {
        if (!id) return { data: null, ...ID_REQUIRED_FAILURE };

        const { habit: existingHabit, failure: loadFailure } = await loadHabitForWrite(
            supabase,
            id,
            NOT_FOUND_FAILURE,
        );
        if (loadFailure) return { data: null, ...loadFailure };

        const updates = {};

        if (fields.title !== undefined) {
            const titleCheck = checkHabitTitle(fields.title);
            if (titleCheck.error)
                return { data: null, error: titleCheck.error, code: titleCheck.code };
            updates.title = titleCheck.title;
        }

        if (fields.description !== undefined) {
            const descriptionCheck = checkHabitDescription(fields.description);
            if (descriptionCheck.error) return { data: null, ...descriptionCheck };
            updates.description = descriptionCheck.description;
        }

        if (fields.color !== undefined) {
            const colorFailure = checkHabitColor(fields.color);
            if (colorFailure) return { data: null, ...colorFailure };
            updates.color = fields.color;
        }

        if (fields.polarity !== undefined) {
            const polarityCheck = checkHabitPolarity(fields.polarity);
            if (polarityCheck.error) return { data: null, ...polarityCheck };
            updates.polarity = polarityCheck.polarity;
        }

        let measureKind = existingHabit.measure_kind;
        if (fields.measure_kind !== undefined) {
            const measureKindCheck = checkHabitMeasureKind(fields.measure_kind);
            if (measureKindCheck.error) return { data: null, ...measureKindCheck };
            measureKind = measureKindCheck.measureKind;
            updates.measure_kind = measureKind;
        }

        if (fields.target_value !== undefined || fields.measure_kind !== undefined) {
            const targetValueToCheck =
                fields.target_value !== undefined
                    ? fields.target_value
                    : existingHabit.target_value;
            const targetValueCheck = checkHabitTargetValue(targetValueToCheck, measureKind);
            if (targetValueCheck.error) return { data: null, ...targetValueCheck };
            updates.target_value = targetValueCheck.targetValue;
        }

        if (fields.unit_code !== undefined || fields.measure_kind !== undefined) {
            const unitCodeToCheck =
                fields.unit_code !== undefined ? fields.unit_code : existingHabit.unit_code;
            const unitCodeCheck = checkHabitUnitCode(unitCodeToCheck, measureKind);
            if (unitCodeCheck.error) return { data: null, ...unitCodeCheck };
            updates.unit_code = unitCodeCheck.unitCode;
        }

        if (fields.recurrence !== undefined) {
            const recurrenceCheck = checkHabitRecurrence(fields.recurrence);
            if (recurrenceCheck.error) return { data: null, ...recurrenceCheck };
            updates.recurrence = recurrenceCheck.recurrence;
        }

        if (fields.started_on !== undefined) {
            const todayLocalDate = await resolveUserTodayLocalDate(supabase, user.id);
            const startedOnCheck = checkHabitStartedOn(fields.started_on, todayLocalDate);
            if (startedOnCheck.error) return { data: null, ...startedOnCheck };
            updates.started_on = startedOnCheck.startedOn;
        }

        if (fields.category_id !== undefined) {
            const categoryCheck = await checkOwnCategoryId(supabase, fields.category_id);
            if (categoryCheck.failure) return { data: null, ...categoryCheck.failure };
            updates.category_id = categoryCheck.categoryId;
        }

        if (Object.keys(updates).length === 0) return { data: existingHabit, error: null };

        const { data: updatedHabit, error } = await supabase
            .from('habits')
            .update(updates)
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error || !updatedHabit) return { data: null, error: 'Failed to update habit' };

        return { data: updatedHabit, error: null };
    },
);

/**
 * Deletes a habit permanently, cascading to its check-ins - chosen over archiving per user sign-off.
 *
 * @param {string} id - Habit to delete.
 * @returns {Promise<{ error: string|null, code?: string }>}
 */
export const deleteHabit = withAuthenticatedAction(
    '[habits] delete',
    'Unexpected error deleting habit',
    async (user, supabase, id) => {
        if (!id) return ID_REQUIRED_FAILURE;

        const { data: deletedHabit, error } = await supabase
            .from('habits')
            .delete()
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error || !deletedHabit) return NOT_FOUND_FAILURE;

        return { error: null };
    },
    { hasData: false },
);
