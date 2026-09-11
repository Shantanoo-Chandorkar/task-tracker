'use client';

import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { getPendingCount, subscribePendingCount } from '@/lib/offline-queue';

/**
 * Persistent bar shown whenever the app is offline, so a dropped connection
 * is never silent. Also surfaces how many edits are queued waiting to sync,
 * whether that's because we're currently offline or a sync attempt is still
 * catching up right after reconnecting.
 */
export default function OfflineBanner() {
    const isOnline = useOnlineStatus();
    const pendingCount = useSyncExternalStore(subscribePendingCount, getPendingCount, () => 0);

    if (isOnline && pendingCount === 0) return null;

    return (
        <div className="flex items-center justify-center gap-2 bg-amber-500/15 border-b border-amber-500/30 px-3 py-1.5 text-xs text-amber-400">
            <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
                {isOnline
                    ? `Syncing ${pendingCount} change${pendingCount === 1 ? '' : 's'}...`
                    : pendingCount > 0
                      ? `You're offline - ${pendingCount} change${pendingCount === 1 ? '' : 's'} will sync when you're back`
                      : "You're offline - changes will sync when you're back"}
            </span>
        </div>
    );
}
