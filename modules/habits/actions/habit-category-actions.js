'use server';

import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import {
    readClientId,
    findOwnRowById,
    insertRowOnce,
    isUniqueViolation,
} from '@/lib/idempotent-create';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { checkHabitCategoryName, checkHabitColor } from '@/modules/habits/domain/habit-input';
import { DEFAULT_HABIT_CATEGORY_COLOR } from '@/modules/habits/habit-limits';
import {
    HABIT_CATEGORY_ID_REQUIRED,
    HABIT_CATEGORY_NOT_FOUND,
    HABIT_CATEGORY_NAME_TAKEN,
} from '@/modules/habits/errors';
import { getNextPosition } from '@/modules/habits/data/append-position';

const ID_REQUIRED_FAILURE = { error: 'Category ID is required', code: HABIT_CATEGORY_ID_REQUIRED };
const NOT_FOUND_FAILURE = { error: 'Category not found', code: HABIT_CATEGORY_NOT_FOUND };
const NAME_TAKEN_FAILURE = {
    error: 'A category with that name already exists',
    code: HABIT_CATEGORY_NAME_TAKEN,
};

/**
 * Creates a habit category at the end of the caller's own order; a client-id retry returns the first row.
 * Same shape as createLabelActions (decision 8), not imported - categories are user-scoped, not space-scoped.
 *
 * @param {object} fields
 * @param {string} [fields.id] - Optional client-made UUID.
 * @param {string} fields.name - Required name, unique per caller ignoring case.
 * @param {string} [fields.color] - `#rrggbb`, defaults to grey.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const createHabitCategory = withAuthenticatedAction(
    '[habit-categories] create',
    'Unexpected error creating category',
    async (user, supabase, fields) => {
        const clientId = readClientId(fields);
        if (clientId.failure) return { data: null, ...clientId.failure };
        const replayedCategory = await findOwnRowById(
            supabase,
            'habit_categories',
            clientId.id,
            'user_id',
            user.id,
        );
        if (replayedCategory) return { data: replayedCategory, error: null };

        const nameCheck = checkHabitCategoryName(fields.name);
        if (nameCheck.error) return { data: null, error: nameCheck.error, code: nameCheck.code };
        const colorFailure = fields.color == null ? null : checkHabitColor(fields.color);
        if (colorFailure) return { data: null, ...colorFailure };

        const position = await getNextPosition(supabase, 'habit_categories', {
            user_id: user.id,
        });
        const { data: createdCategory, error } = await insertRowOnce(
            supabase,
            'habit_categories',
            {
                name: nameCheck.name,
                color: fields.color ?? DEFAULT_HABIT_CATEGORY_COLOR,
                position,
                user_id: user.id,
            },
            { clientId: clientId.id, ownerColumn: 'user_id', userId: user.id },
        );
        if (error) {
            if (isUniqueViolation(error)) return { data: null, ...NAME_TAKEN_FAILURE };
            const guestLimitResult = toGuestLimitResult(error);
            if (guestLimitResult) return { data: null, ...guestLimitResult };
            return { data: null, error: 'Failed to create category' };
        }

        return { data: createdCategory, error: null };
    },
);

/**
 * Updates the name, colour or position of a habit category.
 *
 * @param {string} id - Category to update.
 * @param {Record<string, any>} fields - Partial fields; only `name`, `color` and `position` are read.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const updateHabitCategory = withAuthenticatedAction(
    '[habit-categories] update',
    'Unexpected error updating category',
    async (user, supabase, id, fields) => {
        if (!id) return { data: null, ...ID_REQUIRED_FAILURE };

        const { color, position } = fields;
        let name;
        if (fields.name !== undefined) {
            const nameCheck = checkHabitCategoryName(fields.name);
            if (nameCheck.error)
                return { data: null, error: nameCheck.error, code: nameCheck.code };
            name = nameCheck.name;
        }
        const colorFailure = color === undefined ? null : checkHabitColor(color);
        if (colorFailure) return { data: null, ...colorFailure };

        const { data: updatedCategory, error } = await supabase
            .from('habit_categories')
            .update({
                ...(name !== undefined && { name }),
                ...(color !== undefined && { color }),
                ...(position !== undefined && { position }),
            })
            .eq('id', id)
            .select()
            .maybeSingle();
        if (isUniqueViolation(error)) return { data: null, ...NAME_TAKEN_FAILURE };
        if (error || !updatedCategory) return { data: null, ...NOT_FOUND_FAILURE };

        return { data: updatedCategory, error: null };
    },
);

/**
 * Deletes a habit category; habits that reference it keep their row, since `category_id` just goes to null.
 *
 * @param {string} id - Category to delete.
 * @returns {Promise<{ error: string|null, code?: string }>}
 */
export const deleteHabitCategory = withAuthenticatedAction(
    '[habit-categories] delete',
    'Unexpected error deleting category',
    async (user, supabase, id) => {
        if (!id) return ID_REQUIRED_FAILURE;

        const { data: deletedCategory, error } = await supabase
            .from('habit_categories')
            .delete()
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error || !deletedCategory) return NOT_FOUND_FAILURE;

        return { error: null };
    },
    { hasData: false },
);
