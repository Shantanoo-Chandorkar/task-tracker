'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { duplicateTimerTemplate } from '@/modules/timer/actions/timer-template-actions';
import { claimInFlight } from '@/lib/in-flight-entities';
import { createClientId } from '@/lib/client-id';

// Copy id per source template: kept after a lost reply so a retry cannot copy twice, cleared once the server answers
const pendingCopyIds = new Map();

/**
 * Duplicates a timer template with toast feedback, for the template row's "Duplicate" menu item.
 *
 * @returns {{ duplicateTemplateById: (templateId: string) => Promise<void> }} Duplicates one template by its id.
 */
export function useDuplicateTimerTemplate() {
    const queryClient = useQueryClient();
    const duplicateTemplateById = useCallback(
        async (templateId) => {
            const releaseInFlight = claimInFlight(`timer-template-duplicate:${templateId}`);
            if (!releaseInFlight) return;
            const toastId = toast.loading('Duplicating template...');
            const newId = pendingCopyIds.get(templateId) ?? createClientId();
            pendingCopyIds.set(templateId, newId);

            try {
                let duplicateResult;
                try {
                    duplicateResult = await duplicateTimerTemplate(templateId, newId);
                    pendingCopyIds.delete(templateId);
                } catch {
                    toast.error(
                        'Could not reach the server. Check your connection and try again.',
                        { id: toastId },
                    );
                    return;
                }

                if (duplicateResult.error) {
                    toast.error(duplicateResult.error, { id: toastId });
                    return;
                }

                await queryClient.invalidateQueries({ queryKey: ['timer-templates'] });
                toast.success('Template duplicated', { id: toastId });
            } finally {
                releaseInFlight();
            }
        },
        [queryClient],
    );

    return { duplicateTemplateById };
}
