'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { removeRowFromCache } from '@/lib/query-cache';
import {
    deleteWebhookEndpoint,
    rotateWebhookSecret,
    sendWebhookTestEvent,
    setWebhookEndpointEnabled,
} from '@/actions/webhook-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import ModalShell from '@/components/ui/modal-shell';
import WebhookDeliveryLog from '@/components/webhook/WebhookDeliveryLog';
import {
    PAYLOAD_LEVEL_OPTIONS,
    describeEndpointStatus,
    maskWebhookUrl,
    summarizeEventTypes,
} from '@/lib/webhooks/webhook-display';

const BADGE_VARIANT_BY_TONE = { active: 'secondary', off: 'outline', paused: 'destructive' };
const ACTION_BUTTON_CLASS = 'h-10 gap-1.5';

/**
 * One webhook endpoint: status, where it points, and every action the owner can take on it.
 *
 * @param {object} props
 * @param {object} props.endpoint - Endpoint row (never contains the secret)
 * @param {Function} props.onEdit - Called with the endpoint to open the edit form
 * @param {Function} props.onSecretRotated - Called with the new secret to show it once
 * @param {Function} props.onDeleted - Called with the endpoint id once it is deleted
 */
export default function WebhookEndpointCard({ endpoint, onEdit, onSecretRotated, onDeleted }) {
    const queryClient = useQueryClient();
    const [pendingAction, setPendingAction] = useState(null);
    const [confirmAction, setConfirmAction] = useState(null);
    const rotateConfirm = useConfirmAction(confirmAction === 'rotate');
    const deleteConfirm = useConfirmAction(confirmAction === 'delete');
    const [isLogOpen, setIsLogOpen] = useState(false);

    const endpointStatus = describeEndpointStatus(endpoint);
    const payloadLevelLabel = PAYLOAD_LEVEL_OPTIONS.find(
        (option) => option.value === endpoint.payload_level,
    )?.label;

    async function refreshEndpoints() {
        await queryClient.invalidateQueries({ queryKey: ['webhook-endpoints', endpoint.space_id] });
    }

    /**
     * Runs one action with a pending flag, a network-failure toast, and a refresh on success.
     *
     * @param {string} actionName - Key used for the pending state
     * @param {() => Promise<{ error?: string|null, data?: any }>} runAction - The server action call
     * @param {(actionResult: object) => Promise<void>|void} onSuccess - Runs after a successful action
     * @returns {Promise<void>}
     */
    async function runEndpointAction(actionName, runAction, onSuccess) {
        setPendingAction(actionName);
        try {
            const actionResult = await runAction();
            if (actionResult.error) {
                toast.error(actionResult.error);
                return;
            }
            await onSuccess(actionResult);
        } catch {
            toast.error('Could not reach the server. Try again.');
        } finally {
            setPendingAction(null);
            setConfirmAction(null);
        }
    }

    function handleSendTest() {
        return runEndpointAction(
            'test',
            () => sendWebhookTestEvent(endpoint.id),
            async () => {
                toast.success('Test event queued. It should arrive within about 10 seconds.');
                setIsLogOpen(true);
                await queryClient.invalidateQueries({
                    queryKey: ['webhook-deliveries', endpoint.id],
                });
            },
        );
    }

    function handleToggleEnabled() {
        return runEndpointAction(
            'toggle',
            () => setWebhookEndpointEnabled(endpoint.id, !endpoint.enabled),
            async () => {
                await refreshEndpoints();
                toast.success(endpoint.enabled ? 'Webhook turned off' : 'Webhook turned on');
            },
        );
    }

    function handleRotate() {
        return rotateConfirm.runConfirmedAction({
            entityKey: `webhook-rotate:${endpoint.id}`,
            loadingMessage: 'Rotating the signing secret...',
            successMessage: 'Signing secret rotated',
            action: () => rotateWebhookSecret(endpoint.id),
            onSuccess: async (rotateResult) => {
                await refreshEndpoints();
                onSecretRotated(rotateResult.data.secret);
            },
            close: () => setConfirmAction(null),
        });
    }

    function handleDelete() {
        return deleteConfirm.runConfirmedAction({
            entityKey: `webhook-delete:${endpoint.id}`,
            loadingMessage: 'Deleting webhook...',
            successMessage: 'Webhook deleted',
            action: () => deleteWebhookEndpoint(endpoint.id),
            // The row leaves the list at once, so the popup closes onto the final screen; the reload is quiet.
            onSuccess: () => {
                onDeleted(endpoint.id);
                removeRowFromCache(
                    queryClient,
                    ['webhook-endpoints', endpoint.space_id],
                    endpoint.id,
                );
                refreshEndpoints();
            },
            close: () => setConfirmAction(null),
        });
    }

    const isBusy = pendingAction !== null || rotateConfirm.isPending || deleteConfirm.isPending;

    return (
        <div className="space-y-3 rounded-xl border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                        {endpoint.name}
                    </h3>
                    <p className="truncate text-xs text-muted-foreground">
                        {maskWebhookUrl(endpoint.url)}
                    </p>
                </div>
                <Badge variant={BADGE_VARIANT_BY_TONE[endpointStatus.tone]}>
                    {endpointStatus.label}
                </Badge>
            </div>

            <p className="text-xs text-muted-foreground">
                {summarizeEventTypes(endpoint.event_types)} · {payloadLevelLabel} detail
            </p>

            {endpointStatus.detail && (
                <Alert>
                    <AlertDescription>{endpointStatus.detail}</AlertDescription>
                </Alert>
            )}

            <div className="grid grid-cols-2 gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className={ACTION_BUTTON_CLASS}
                    disabled={isBusy || !endpoint.enabled}
                    onClick={handleSendTest}
                >
                    {pendingAction === 'test' && <Loader size="xs" />}
                    Send test event
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className={ACTION_BUTTON_CLASS}
                    disabled={isBusy}
                    onClick={handleToggleEnabled}
                >
                    {pendingAction === 'toggle' && <Loader size="xs" />}
                    {endpoint.enabled ? 'Turn off' : 'Turn on'}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className={ACTION_BUTTON_CLASS}
                    disabled={isBusy}
                    onClick={() => onEdit(endpoint)}
                >
                    Edit
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className={ACTION_BUTTON_CLASS}
                    disabled={isBusy}
                    onClick={() => setConfirmAction('rotate')}
                >
                    Rotate secret
                </Button>
            </div>
            <Button
                type="button"
                variant="destructive"
                className={`${ACTION_BUTTON_CLASS} w-full`}
                disabled={isBusy}
                onClick={() => setConfirmAction('delete')}
            >
                Delete webhook
            </Button>

            <div>
                <button
                    type="button"
                    onClick={() => setIsLogOpen((current) => !current)}
                    aria-expanded={isLogOpen}
                    className="flex w-full items-center justify-between py-1.5 text-sm font-medium text-foreground"
                >
                    Recent deliveries
                    {isLogOpen ? (
                        <ChevronUp className="h-4 w-4" />
                    ) : (
                        <ChevronDown className="h-4 w-4" />
                    )}
                </button>
                {isLogOpen && <WebhookDeliveryLog endpointId={endpoint.id} />}
            </div>

            <ModalShell
                open={confirmAction === 'rotate'}
                onClose={() => setConfirmAction(null)}
                isBusy={rotateConfirm.isPending}
                errorMessage={rotateConfirm.errorMessage}
                variant="alert"
                title="Rotate the signing secret?"
                description="You get a new secret now. The old one keeps working for 24 hours so your receiver can switch over."
                footer={
                    <>
                        <AlertDialogCancel
                            onClick={() => setConfirmAction(null)}
                            disabled={rotateConfirm.isPending}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleRotate}
                            disabled={isBusy}
                            className="gap-1.5"
                        >
                            {rotateConfirm.isPending && <Loader size="xs" />}
                            Rotate
                        </AlertDialogAction>
                    </>
                }
            />

            <ModalShell
                open={confirmAction === 'delete'}
                onClose={() => setConfirmAction(null)}
                isBusy={deleteConfirm.isPending}
                errorMessage={deleteConfirm.errorMessage}
                variant="alert"
                title={<>Delete &ldquo;{endpoint.name}&rdquo;?</>}
                description="Events stop being sent and its delivery history is removed. This cannot be undone."
                footer={
                    <>
                        <AlertDialogCancel
                            onClick={() => setConfirmAction(null)}
                            disabled={deleteConfirm.isPending}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isBusy}
                            className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteConfirm.isPending && <Loader size="xs" />}
                            Delete
                        </AlertDialogAction>
                    </>
                }
            />
        </div>
    );
}
