import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { getNextPosition } from '@/lib/tasks/append-position';
import {
    readClientId,
    findOwnRowById,
    insertRowOnce,
    isUniqueViolation,
} from '@/lib/idempotent-create';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import {
    resolveSpacePermission,
    blockCreateForPermission,
} from '@/lib/permissions/space-permissions';
import { checkLabelColor, checkLabelName } from './label-input';
import { DEFAULT_LABEL_COLOR } from './label-limits';
import { loadLabelForWrite } from './load-label-for-write';

/**
 * Builds the create, update and remove server actions of one kind of space label (statuses, tags).
 *
 * @param {object} config
 * @param {string} config.table - Table holding the labels
 * @param {string} config.noun - Capitalised singular for messages, e.g. 'Status'
 * @param {string} config.logName - Plural lowercase name for server log lines, e.g. 'statuses'
 * @param {string} [config.deleteColumns] - Extra columns `guardDelete` needs on the row being deleted
 * @param {(supabase: object, label: object) => Promise<{ error: string }|null>} [config.guardDelete] - Refuses a
 *   delete the kind does not allow (e.g. the last status); runs after the permission check
 * @param {{ idRequired?: string, notFound?: string }} [config.codes] - Stable codes for the id and not-found failures
 * @param {{ error: string, code: string }} [config.nameTakenFailure] - What to return when the database refuses a name
 *   that is already used in the space; without it a clash is reported as a generic failure
 * @returns {{ create: Function, update: Function, remove: Function }} Server actions to export from an actions file
 */
export function createLabelActions({
    table,
    noun,
    logName,
    deleteColumns,
    guardDelete,
    codes = {},
    nameTakenFailure,
}) {
    const lowerNoun = noun.toLowerCase();
    const idRequiredFailure = { error: `${noun} ID is required`, ...codeEntry(codes.idRequired) };
    const notFoundFailure = { error: `${noun} not found`, ...codeEntry(codes.notFound) };

    /**
     * Creates a label at the end of its space's order; a retry with the same client-made id returns the first row.
     *
     * @param {object} fields
     * @param {string} [fields.id] - Optional client-made UUID
     * @param {string} fields.name - Required name
     * @param {string} fields.space_id - Required space
     * @param {string} [fields.color] - `#rrggbb`, defaults to grey
     * @returns {{ data: object|null, error: string|null, code?: string }}
     */
    const create = withAuthenticatedAction(
        `[${logName}] create`,
        `Unexpected error creating ${lowerNoun}`,
        async (user, supabase, fields) => {
            const clientId = readClientId(fields);
            if (clientId.failure) return { data: null, ...clientId.failure };
            const replayedLabel = await findOwnRowById(
                supabase,
                table,
                clientId.id,
                'created_by',
                user.id,
            );
            if (replayedLabel) return { data: replayedLabel, error: null };

            const checkedName = checkLabelName(fields.name, noun);
            if (checkedName.failure) return { data: null, ...checkedName.failure };
            const colorFailure = fields.color == null ? null : checkLabelColor(fields.color);
            if (colorFailure) return { data: null, ...colorFailure };
            if (!fields.space_id) return { data: null, error: 'A space is required' };

            const permissionLevel = await resolveSpacePermission(supabase, fields.space_id);
            const permissionBlock = blockCreateForPermission(permissionLevel);
            if (permissionBlock) return { data: null, ...permissionBlock };

            const position = await getNextPosition(supabase, table, { space_id: fields.space_id });
            const { data: createdLabel, error } = await insertRowOnce(
                supabase,
                table,
                {
                    name: checkedName.name,
                    color: fields.color ?? DEFAULT_LABEL_COLOR,
                    position,
                    space_id: fields.space_id,
                    created_by: user.id,
                },
                { clientId: clientId.id, ownerColumn: 'created_by', userId: user.id },
            );
            if (error) {
                if (nameTakenFailure && isUniqueViolation(error)) {
                    return { data: null, ...nameTakenFailure };
                }
                const guestLimitResult = toGuestLimitResult(error);
                if (guestLimitResult) return { data: null, ...guestLimitResult };
                return { data: null, error: `Failed to create ${lowerNoun}` };
            }

            return { data: createdLabel, error: null };
        },
    );

    /**
     * Updates the name, colour or position of a label. Nothing else can be written through this action.
     *
     * @param {string} id - Label to update
     * @param {object} fields - Partial fields; only `name`, `color` and `position` are read
     * @returns {{ data: object|null, error: string|null, code?: string }}
     */
    const update = withAuthenticatedAction(
        `[${logName}] update`,
        `Unexpected error updating ${lowerNoun}`,
        async (user, supabase, id, fields) => {
            if (!id) return { data: null, ...idRequiredFailure };

            const { color, position } = fields;
            let name;
            if (fields.name !== undefined) {
                const checkedName = checkLabelName(fields.name, noun);
                if (checkedName.failure) return { data: null, ...checkedName.failure };
                name = checkedName.name;
            }
            const colorFailure = color === undefined ? null : checkLabelColor(color);
            if (colorFailure) return { data: null, ...colorFailure };

            const { failure } = await loadLabelForWrite(supabase, user, {
                table,
                id,
                notFoundFailure,
            });
            if (failure) return { data: null, ...failure };

            const { data: updatedLabel, error } = await supabase
                .from(table)
                .update({
                    ...(name !== undefined && { name }),
                    ...(color !== undefined && { color }),
                    ...(position !== undefined && { position }),
                })
                .eq('id', id)
                .select()
                .maybeSingle();
            if (nameTakenFailure && isUniqueViolation(error)) {
                return { data: null, ...nameTakenFailure };
            }
            if (error || !updatedLabel)
                return { data: null, error: `Failed to update ${lowerNoun}` };

            return { data: updatedLabel, error: null };
        },
    );

    /**
     * Deletes a label, after the kind's own guard allows it.
     *
     * @param {string} id - Label to delete
     * @returns {{ error: string|null, code?: string }}
     */
    const remove = withAuthenticatedAction(
        `[${logName}] delete`,
        `Unexpected error deleting ${lowerNoun}`,
        async (user, supabase, id) => {
            if (!id) return idRequiredFailure;

            const { label, failure } = await loadLabelForWrite(supabase, user, {
                table,
                id,
                columns: deleteColumns,
                notFoundFailure,
            });
            if (failure) return failure;

            const guardFailure = await guardDelete?.(supabase, label);
            if (guardFailure) return guardFailure;

            const { data: deletedLabel, error } = await supabase
                .from(table)
                .delete()
                .eq('id', id)
                .select()
                .maybeSingle();
            if (error || !deletedLabel) return notFoundFailure;

            return { error: null };
        },
        { hasData: false },
    );

    return { create, update, remove };
}

function codeEntry(code) {
    return code ? { code } : {};
}
