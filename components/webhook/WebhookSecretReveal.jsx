'use client';

import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Shows a signing secret once, right after create or rotate; it is never cached or read back from the server.
 *
 * @param {object} props
 * @param {string} props.secret - The new signing secret
 * @param {string} props.heading - What just happened, e.g. 'Webhook created'
 * @param {Function} props.onDone - Called once the owner confirms they saved it
 */
export default function WebhookSecretReveal({ secret, heading, onDone }) {
    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(secret);
            toast.success('Secret copied');
        } catch {
            toast.error('Could not copy. Select the secret and copy it by hand.');
        }
    }

    return (
        <div
            className="space-y-3 rounded-xl border border-border bg-card p-3"
            role="region"
            aria-label="New signing secret"
        >
            <div>
                <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
                <p className="text-sm text-muted-foreground">
                    Copy this signing secret now. It is shown only once, and your receiver needs it
                    to check that events really come from here.
                </p>
            </div>
            <div className="flex items-center gap-2">
                <Input
                    readOnly
                    value={secret}
                    aria-label="Signing secret"
                    className="font-mono text-xs"
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    aria-label="Copy secret"
                >
                    <Copy className="h-4 w-4" />
                </Button>
            </div>
            <Button type="button" onClick={onDone} className="h-10 w-full">
                I have saved it
            </Button>
        </div>
    );
}
