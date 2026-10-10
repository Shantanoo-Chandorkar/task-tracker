'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { createWebhookEndpoint, updateWebhookEndpoint } from '@/actions/webhook-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import LabeledField from '@/components/custom/LabeledField';
import { Loader } from '@/components/custom/Loader';
import {
    ALL_TASK_EVENTS,
    EVENT_OPTIONS,
    PAYLOAD_LEVEL_OPTIONS,
} from '@/lib/webhooks/webhook-display';

/**
 * A labelled checkbox row; the whole row is tappable for thumb reach.
 *
 * @param {object} props
 * @param {string} props.label - Text next to the box
 * @param {boolean} props.checked - Whether the box is ticked
 * @param {boolean} [props.disabled] - Whether the box is locked
 * @param {Function} props.onChange - Called with the new checked state
 */
function CheckboxRow({ label, checked, disabled = false, onChange }) {
    return (
        <label className="flex min-h-9 cursor-pointer items-center gap-2.5 has-disabled:cursor-not-allowed has-disabled:opacity-60">
            <Checkbox checked={checked} disabled={disabled} onCheckedChange={onChange} />
            <span className="text-sm text-foreground">{label}</span>
        </label>
    );
}

/**
 * Create or edit form for one webhook endpoint, shown inline in the settings sheet.
 *
 * @param {object} props
 * @param {string} props.spaceId - Space the endpoint belongs to
 * @param {object} [props.endpoint] - Existing endpoint to edit; omit to create
 * @param {Function} props.onSaved - `{ secret, endpointId }` after create, `{}` after edit; form locks until it settles
 * @param {Function} props.onCancel - Called when the owner backs out
 */
export default function WebhookEndpointForm({ spaceId, endpoint, onSaved, onCancel }) {
    const isEditing = Boolean(endpoint);
    const [name, setName] = useState(endpoint?.name ?? 'Webhook');
    const [url, setUrl] = useState(endpoint?.url ?? '');
    const [eventTypes, setEventTypes] = useState(endpoint?.event_types ?? [ALL_TASK_EVENTS]);
    const [payloadLevel, setPayloadLevel] = useState(endpoint?.payload_level ?? 'standard');
    const [isSaving, setIsSaving] = useState(false);

    const isAllEvents = eventTypes.includes(ALL_TASK_EVENTS);

    function handleAllEventsChange(checked) {
        setEventTypes(checked ? [ALL_TASK_EVENTS] : []);
    }

    function handleEventChange(eventType, checked) {
        setEventTypes((current) =>
            checked
                ? [...current, eventType]
                : current.filter((existing) => existing !== eventType),
        );
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (isSaving) return;
        if (!url.trim()) {
            toast.error('Enter the address to send events to');
            return;
        }
        if (eventTypes.length === 0) {
            toast.error('Choose at least one event to send');
            return;
        }

        setIsSaving(true);
        try {
            const fields = { name, url, event_types: eventTypes, payload_level: payloadLevel };
            const saveResult = isEditing
                ? await updateWebhookEndpoint(endpoint.id, fields)
                : await createWebhookEndpoint(spaceId, fields);
            if (saveResult.error) {
                toast.error(saveResult.error);
                return;
            }
            toast.success(isEditing ? 'Webhook updated' : 'Webhook created');
            // Awaited so the form stays locked until the parent's refetch finishes.
            await onSaved({
                secret: saveResult.data?.secret,
                endpointId: saveResult.data?.endpoint?.id,
            });
        } catch {
            toast.error('Could not reach the server. Try again.');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-4"
            aria-label={isEditing ? 'Edit webhook' : 'Add webhook'}
        >
            <LabeledField label="Name">
                {({ controlId }) => (
                    <Input
                        id={controlId}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        maxLength={100}
                        placeholder="Webhook name"
                    />
                )}
            </LabeledField>

            <LabeledField label="Send events to (https address)">
                {({ controlId }) => (
                    <Input
                        id={controlId}
                        type="url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        maxLength={2048}
                        placeholder="https://hooks.example.com/..."
                        autoComplete="off"
                    />
                )}
            </LabeledField>

            <fieldset className="space-y-0.5">
                <legend className="mb-1 text-xs text-muted-foreground">Events</legend>
                <CheckboxRow
                    label="All task events"
                    checked={isAllEvents}
                    onChange={handleAllEventsChange}
                />
                {EVENT_OPTIONS.map((option) => (
                    <CheckboxRow
                        key={option.value}
                        label={option.label}
                        checked={isAllEvents || eventTypes.includes(option.value)}
                        disabled={isAllEvents}
                        onChange={(checked) => handleEventChange(option.value, checked)}
                    />
                ))}
            </fieldset>

            <fieldset className="space-y-1">
                <legend className="mb-1 text-xs text-muted-foreground">
                    Detail sent with each event
                </legend>
                {PAYLOAD_LEVEL_OPTIONS.map((option) => (
                    <label
                        key={option.value}
                        className="flex min-h-9 cursor-pointer items-start gap-2.5 py-1"
                    >
                        <input
                            type="radio"
                            name="payload-level"
                            value={option.value}
                            checked={payloadLevel === option.value}
                            onChange={() => setPayloadLevel(option.value)}
                            className="mt-1"
                        />
                        <span className="text-sm text-foreground">
                            {option.label}
                            <span className="block text-xs text-muted-foreground">
                                {option.hint}
                            </span>
                        </span>
                    </label>
                ))}
            </fieldset>

            {payloadLevel === 'full' && (
                <Alert variant="destructive">
                    <AlertDescription>
                        Full detail sends task descriptions, including text your collaborators
                        wrote, to this address.
                    </AlertDescription>
                </Alert>
            )}

            <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button type="submit" disabled={isSaving} className="h-10 gap-1.5">
                    {isSaving && <Loader size="xs" />}
                    {isEditing ? 'Save changes' : 'Create webhook'}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    disabled={isSaving}
                    className="h-10"
                >
                    Cancel
                </Button>
            </div>
        </form>
    );
}
