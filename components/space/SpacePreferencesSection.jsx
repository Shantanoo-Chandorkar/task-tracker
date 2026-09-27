'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSpaceById } from '@/hooks/useSpaceById';
import { updateSpace } from '@/actions/space-actions';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader } from '@/components/ui/loader';

/**
 * Space-wide task creation preferences, rendered inside the space's Settings sheet.
 * Only the space owner may change these - RLS enforces it, this just gates the control itself.
 *
 * @param {object} props
 * @param {string} props.spaceId - Space these preferences belong to
 * @param {boolean} props.isOwner - Whether the current user owns this space
 */
export default function SpacePreferencesSection({ spaceId, isOwner }) {
    const queryClient = useQueryClient();
    const [pending, setPending] = useState(false);
    const space = useSpaceById(spaceId);
    const requiresDueDate = space?.require_due_date ?? false;

    async function handleToggle(checked) {
        setPending(true);
        try {
            const result = await updateSpace(spaceId, { require_due_date: checked });
            if (result.error) {
                toast.error(result.error);
                return;
            }
            await queryClient.invalidateQueries({ queryKey: ['spaces'] });
            toast.success(checked ? 'Due dates are now required' : 'Due dates are now optional');
        } catch {
            toast.error('Could not reach the server. Try again.');
        } finally {
            setPending(false);
        }
    }

    return (
        <div className="space-y-3 max-w-lg">
            <label className="flex items-start gap-2.5 cursor-pointer has-disabled:cursor-not-allowed">
                <Checkbox
                    checked={requiresDueDate}
                    onCheckedChange={handleToggle}
                    disabled={!isOwner || pending}
                    className="mt-0.5"
                />
                <span className="text-sm text-foreground">
                    Require a due date on new tasks
                    {pending && <Loader size="xs" className="inline-block ml-1.5 align-middle" />}
                </span>
            </label>
            {!isOwner && (
                <p className="text-xs text-muted-foreground">
                    Only the space owner can change this.
                </p>
            )}
        </div>
    );
}
