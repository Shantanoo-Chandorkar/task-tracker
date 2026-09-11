'use client';

import { useSyncExternalStore } from 'react';
import { subscribeSyncIssues, getSyncIssues } from '@/lib/offline-queue';

/**
 * Small dot shown on the Settings nav icon when a queued change was permanently
 * rejected and hasn't been reviewed yet. Renders nothing once the list is empty.
 */
export default function SyncIssueBadge() {
    const issueCount = useSyncExternalStore(
        subscribeSyncIssues,
        () => getSyncIssues().length,
        () => 0,
    );

    if (issueCount === 0) return null;

    return (
        <span
            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive"
            aria-label={`${issueCount} unreviewed sync issue${issueCount === 1 ? '' : 's'}`}
        />
    );
}
