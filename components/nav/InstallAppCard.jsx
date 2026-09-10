'use client';

import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

function isIosDevice() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Settings-page install control. Additive to the browser's own native
 * "Add to Home Screen" affordance, not a replacement for it — this just
 * gives the same action a visible, discoverable home in-app.
 */
export default function InstallAppCard() {
    const { canPrompt, isInstalled, promptInstall } = useInstallPrompt();

    async function handleClick() {
        if (isInstalled) {
            toast.info('Already installed.');
            return;
        }

        if (canPrompt) {
            const outcome = await promptInstall();
            if (outcome === 'dismissed') {
                toast.info('Install dismissed. You can try again anytime.');
            }
            return;
        }

        if (isIosDevice()) {
            toast.info('Tap the Share icon, then "Add to Home Screen".');
            return;
        }

        toast.info('Look for "Install app" or "Add to Home Screen" in your browser\'s menu.');
    }

    return (
        <div className="space-y-2 max-w-lg">
            <div>
                <h2 className="text-base font-semibold mb-1">Install App</h2>
                <p className="text-sm text-muted-foreground">
                    Install Task Tracker on this device for quick access and offline viewing.
                </p>
            </div>

            <div className="rounded-xl bg-card px-3 py-2.5 flex items-center justify-between">
                <span className="text-sm text-foreground">
                    {isInstalled ? 'Installed' : 'Task Tracker'}
                </span>
                <Button size="sm" onClick={handleClick} disabled={isInstalled} className="gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    {isInstalled ? 'Installed' : 'Install'}
                </Button>
            </div>
        </div>
    );
}
