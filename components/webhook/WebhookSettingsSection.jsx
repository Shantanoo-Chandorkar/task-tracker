'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebhookEndpointsQuery } from '@/hooks/useWebhookEndpointsQuery';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import WebhookEndpointCard from '@/components/webhook/WebhookEndpointCard';
import WebhookEndpointForm from '@/components/webhook/WebhookEndpointForm';
import WebhookSecretReveal from '@/components/webhook/WebhookSecretReveal';

/**
 * Webhook management for one space inside its Settings sheet; owner only (the sheet hides it, the server re-checks).
 * The schema allows several endpoints per space; the screen offers to add just one.
 *
 * @param {object} props
 * @param {string} props.spaceId - Space these webhooks belong to
 */
export default function WebhookSettingsSection({ spaceId }) {
    const queryClient = useQueryClient();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [endpointBeingEdited, setEndpointBeingEdited] = useState(null);
    const [revealedSecret, setRevealedSecret] = useState(null);

    const { data: endpoints = [], isLoading, isError, refetch } = useWebhookEndpointsQuery(spaceId);

    function openAddForm() {
        setEndpointBeingEdited(null);
        setIsFormOpen(true);
    }

    function openEditForm(endpoint) {
        setEndpointBeingEdited(endpoint);
        setIsFormOpen(true);
    }

    function closeForm() {
        setIsFormOpen(false);
        setEndpointBeingEdited(null);
    }

    async function handleFormSaved({ secret }) {
        closeForm();
        await queryClient.invalidateQueries({ queryKey: ['webhook-endpoints', spaceId] });
        if (secret) setRevealedSecret({ secret, heading: 'Webhook created' });
    }

    function handleSecretRotated(secret) {
        setRevealedSecret({ secret, heading: 'New signing secret' });
    }

    return (
        <div className="max-w-lg space-y-4">
            <p className="text-sm text-muted-foreground">
                Send task activity to Zapier, Make, n8n or your own server. Every event is signed so
                the receiver can check it really came from here.
            </p>

            {revealedSecret && (
                <WebhookSecretReveal
                    secret={revealedSecret.secret}
                    heading={revealedSecret.heading}
                    onDone={() => setRevealedSecret(null)}
                />
            )}

            {isLoading && (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-card py-6 text-sm text-muted-foreground">
                    <Loader size="sm" />
                    Loading webhooks...
                </div>
            )}

            {isError && (
                <div className="space-y-2 rounded-xl bg-card py-4 text-center">
                    <p className="text-sm text-destructive">Could not load webhooks.</p>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => refetch()}
                        className="h-10"
                    >
                        Try again
                    </Button>
                </div>
            )}

            {isFormOpen && (
                <WebhookEndpointForm
                    spaceId={spaceId}
                    endpoint={endpointBeingEdited ?? undefined}
                    onSaved={handleFormSaved}
                    onCancel={closeForm}
                />
            )}

            {!isFormOpen &&
                endpoints.map((endpoint) => (
                    <WebhookEndpointCard
                        key={endpoint.id}
                        endpoint={endpoint}
                        onEdit={openEditForm}
                        onSecretRotated={handleSecretRotated}
                    />
                ))}

            {!isFormOpen && !isLoading && !isError && endpoints.length === 0 && (
                <Button type="button" onClick={openAddForm} className="h-10 w-full">
                    Add webhook
                </Button>
            )}
        </div>
    );
}
