'use server';

import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { readClientId, findOwnRowById, insertRowOnce } from '@/lib/idempotent-create';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { checkTemplateName, checkTemplateBlocks } from '@/modules/timer/domain/template-input';
import { toTimerTemplateRateLimitResult } from '@/modules/timer/domain/timer-template-rate-limit';
import { TIMER_TEMPLATE_ID_REQUIRED, TIMER_TEMPLATE_NOT_FOUND } from '@/modules/timer/errors';
import { loadTimerTemplateForWrite } from '@/modules/timer/data/load-timer-template-for-write';

const ID_REQUIRED_FAILURE = { error: 'Template ID is required', code: TIMER_TEMPLATE_ID_REQUIRED };
const NOT_FOUND_FAILURE = { error: 'Template not found', code: TIMER_TEMPLATE_NOT_FOUND };

/**
 * Maps a timer_templates write error to a friendly result, or a fixed generic message.
 *
 * @param {{ message?: string }} databaseError - Error from an insert, update or delete.
 * @param {string} genericError - Fallback message when the error matches no known marker.
 * @returns {{ error: string, code?: string }} The mapped, user-facing result.
 */
function toTimerTemplateWriteFailure(databaseError, genericError) {
    const guestLimitResult = toGuestLimitResult(databaseError);
    if (guestLimitResult) return guestLimitResult;
    const rateLimitResult = toTimerTemplateRateLimitResult(databaseError);
    if (rateLimitResult) return rateLimitResult;
    return { error: genericError };
}

/**
 * Creates a timer template; a client-id retry returns the first row.
 *
 * @param {object} fields
 * @param {string} [fields.id] - Optional client-made UUID.
 * @param {string} fields.name - Required template name.
 * @param {unknown} fields.blocks - Work/break block list.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const createTimerTemplate = withAuthenticatedAction(
    '[timer-templates] create',
    'Unexpected error creating template',
    async (user, supabase, fields) => {
        const clientId = readClientId(fields);
        if (clientId.failure) return { data: null, ...clientId.failure };
        const replayedTemplate = await findOwnRowById(
            supabase,
            'timer_templates',
            clientId.id,
            'user_id',
            user.id,
        );
        if (replayedTemplate) return { data: replayedTemplate, error: null };

        const nameCheck = checkTemplateName(fields.name);
        if (nameCheck.error) return { data: null, error: nameCheck.error, code: nameCheck.code };
        const blocksCheck = checkTemplateBlocks(fields.blocks);
        if (blocksCheck.error) {
            return { data: null, error: blocksCheck.error, code: blocksCheck.code };
        }

        const { data: createdTemplate, error } = await insertRowOnce(
            supabase,
            'timer_templates',
            { name: nameCheck.name, blocks: blocksCheck.blocks, user_id: user.id },
            { clientId: clientId.id, ownerColumn: 'user_id', userId: user.id },
        );
        if (error) {
            return {
                data: null,
                ...toTimerTemplateWriteFailure(error, 'Failed to create template'),
            };
        }

        return { data: createdTemplate, error: null };
    },
);

/**
 * Updates a timer template's name and/or blocks.
 *
 * @param {string} id - Template to update.
 * @param {object} fields - Partial fields; only `name` and `blocks` are read.
 * @param {string} [fields.name] - New name.
 * @param {unknown} [fields.blocks] - New block list.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const updateTimerTemplate = withAuthenticatedAction(
    '[timer-templates] update',
    'Unexpected error updating template',
    async (user, supabase, id, fields) => {
        if (!id) return { data: null, ...ID_REQUIRED_FAILURE };

        let name;
        if (fields.name !== undefined) {
            const nameCheck = checkTemplateName(fields.name);
            if (nameCheck.error) {
                return { data: null, error: nameCheck.error, code: nameCheck.code };
            }
            name = nameCheck.name;
        }
        let blocks;
        if (fields.blocks !== undefined) {
            const blocksCheck = checkTemplateBlocks(fields.blocks);
            if (blocksCheck.error) {
                return { data: null, error: blocksCheck.error, code: blocksCheck.code };
            }
            blocks = blocksCheck.blocks;
        }

        const { data: updatedTemplate, error } = await supabase
            .from('timer_templates')
            .update({
                ...(name !== undefined && { name }),
                ...(blocks !== undefined && { blocks }),
            })
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error) {
            return {
                data: null,
                ...toTimerTemplateWriteFailure(error, 'Failed to update template'),
            };
        }
        if (!updatedTemplate) return { data: null, ...NOT_FOUND_FAILURE };

        return { data: updatedTemplate, error: null };
    },
);

/**
 * Deletes a timer template; sessions that reference it keep their row, since `template_id` just goes to null.
 *
 * @param {string} id - Template to delete.
 * @returns {Promise<{ error: string|null, code?: string }>}
 */
export const deleteTimerTemplate = withAuthenticatedAction(
    '[timer-templates] delete',
    'Unexpected error deleting template',
    async (user, supabase, id) => {
        if (!id) return ID_REQUIRED_FAILURE;

        const { data: deletedTemplate, error } = await supabase
            .from('timer_templates')
            .delete()
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error) return toTimerTemplateWriteFailure(error, 'Failed to delete template');
        if (!deletedTemplate) return NOT_FOUND_FAILURE;

        return { error: null };
    },
    { hasData: false },
);

/**
 * Duplicates a timer template with its own name and blocks; a client-id retry returns the first copy.
 *
 * @param {string} sourceId - Template to copy.
 * @param {string} [newId] - Optional client-made UUID for the copy.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const duplicateTimerTemplate = withAuthenticatedAction(
    '[timer-templates] duplicate',
    'Unexpected error duplicating template',
    async (user, supabase, sourceId, newId) => {
        if (!sourceId) return { data: null, ...ID_REQUIRED_FAILURE };

        const clientId = readClientId({ id: newId });
        if (clientId.failure) return { data: null, ...clientId.failure };
        const replayedTemplate = await findOwnRowById(
            supabase,
            'timer_templates',
            clientId.id,
            'user_id',
            user.id,
        );
        if (replayedTemplate) return { data: replayedTemplate, error: null };

        const { template: sourceTemplate, failure: loadFailure } = await loadTimerTemplateForWrite(
            supabase,
            sourceId,
            NOT_FOUND_FAILURE,
        );
        if (loadFailure) return { data: null, ...loadFailure };

        const { data: createdTemplate, error } = await insertRowOnce(
            supabase,
            'timer_templates',
            {
                name: `${sourceTemplate.name} (copy)`,
                blocks: sourceTemplate.blocks,
                user_id: user.id,
            },
            { clientId: clientId.id, ownerColumn: 'user_id', userId: user.id },
        );
        if (error) {
            return {
                data: null,
                ...toTimerTemplateWriteFailure(error, 'Failed to duplicate template'),
            };
        }

        return { data: createdTemplate, error: null };
    },
);
