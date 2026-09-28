'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSpaceById } from '@/hooks/useSpaceById';
import { updateSpace } from '@/actions/space-actions';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
    const [dueDatePending, setDueDatePending] = useState(false);
    const [capPending, setCapPending] = useState(false);
    const space = useSpaceById(spaceId);
    const requiresDueDate = space?.require_due_date ?? false;
    const currentCap = space?.max_subtasks_per_parent ?? null;

    // Local, not derived every render - safe since this section remounts on each accordion open.
    const [capEnabled, setCapEnabled] = useState(currentCap !== null);
    const [capValue, setCapValue] = useState(currentCap?.toString() ?? '');

    async function invalidateSpaces() {
        await queryClient.invalidateQueries({ queryKey: ['spaces'] });
    }

    async function handleDueDateToggle(checked) {
        setDueDatePending(true);
        try {
            const result = await updateSpace(spaceId, { require_due_date: checked });
            if (result.error) {
                toast.error(result.error);
                return;
            }
            await invalidateSpaces();
            toast.success(checked ? 'Due dates are now required' : 'Due dates are now optional');
        } catch {
            toast.error('Could not reach the server. Try again.');
        } finally {
            setDueDatePending(false);
        }
    }

    async function commitCap(nextMaxSubtasks) {
        setCapPending(true);
        try {
            const result = await updateSpace(spaceId, {
                max_subtasks_per_parent: nextMaxSubtasks,
            });
            if (result.error) {
                toast.error(result.error);
                return;
            }
            await invalidateSpaces();
            toast.success(
                nextMaxSubtasks
                    ? `Subtasks limited to ${nextMaxSubtasks} per parent`
                    : 'Subtask limit removed',
            );
        } catch {
            toast.error('Could not reach the server. Try again.');
        } finally {
            setCapPending(false);
        }
    }

    function handleCapCheckedChange(checked) {
        setCapEnabled(checked);
        if (!checked) {
            setCapValue('');
            commitCap(null);
        }
    }

    function commitCapInputIfValid() {
        const trimmedCapInput = capValue.trim();
        if (!trimmedCapInput) return;

        const parsedCap = Number(trimmedCapInput);
        if (!Number.isInteger(parsedCap) || parsedCap <= 0) {
            toast.error('Enter a positive whole number');
            return;
        }
        commitCap(parsedCap);
    }

    function handleCapInputKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
        }
    }

    return (
        <div className="space-y-4 max-w-lg">
            <label className="flex items-start gap-2.5 cursor-pointer has-disabled:cursor-not-allowed">
                <Checkbox
                    checked={requiresDueDate}
                    onCheckedChange={handleDueDateToggle}
                    disabled={!isOwner || dueDatePending}
                    className="mt-0.5"
                />
                <span className="text-sm text-foreground">
                    Require a due date on new tasks
                    {dueDatePending && (
                        <Loader size="xs" className="inline-block ml-1.5 align-middle" />
                    )}
                </span>
            </label>

            <div className="space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer has-disabled:cursor-not-allowed">
                    <Checkbox
                        checked={capEnabled}
                        onCheckedChange={handleCapCheckedChange}
                        disabled={!isOwner || capPending}
                        className="mt-0.5"
                    />
                    <span className="text-sm text-foreground">
                        Limit direct subtasks per parent
                        {capPending && (
                            <Loader size="xs" className="inline-block ml-1.5 align-middle" />
                        )}
                    </span>
                </label>
                {capEnabled && (
                    <Input
                        type="number"
                        min="1"
                        step="1"
                        value={capValue}
                        onChange={(event) => setCapValue(event.target.value)}
                        onBlur={commitCapInputIfValid}
                        onKeyDown={handleCapInputKeyDown}
                        disabled={!isOwner || capPending}
                        placeholder="Max subtasks"
                        className="ml-7 w-32"
                    />
                )}
            </div>

            {!isOwner && (
                <p className="text-xs text-muted-foreground">
                    Only the space owner can change these.
                </p>
            )}
        </div>
    );
}
