'use client';

import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { RotateCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
    subscribeSyncIssues,
    getSyncIssues,
    retrySyncIssue,
    dismissSyncIssue,
} from '@/lib/offline-queue';

/**
 * Settings-page card listing queued changes that were permanently rejected by
 * the server on replay. Renders nothing when there's nothing to review.
 */
const EMPTY_ISSUES = [];

export default function SyncIssuesCard() {
    const issues = useSyncExternalStore(subscribeSyncIssues, getSyncIssues, () => EMPTY_ISSUES);
    const isOnline = useOnlineStatus();

    if (issues.length === 0) return null;

    async function handleRetry(id) {
        const result = await retrySyncIssue(id);
        if (result.error) {
            toast.error(`Still failing: ${result.error}`);
        } else {
            toast.success('Synced');
        }
    }

    async function handleDismiss(id) {
        await dismissSyncIssue(id);
    }

    return (
        <div className="space-y-2 max-w-lg">
            <div>
                <h2 className="text-base font-semibold mb-1">Sync Issues</h2>
                <p className="text-sm text-muted-foreground">
                    These changes were made offline but rejected when syncing back.
                </p>
            </div>

            <div className="space-y-2">
                {issues.map((issue) => (
                    <div key={issue.id} className="rounded-xl bg-card px-3 py-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-foreground truncate">{issue.label}</span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                {issue.retryable && isOnline && (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        onClick={() => handleRetry(issue.id)}
                                        aria-label="Retry"
                                    >
                                        <RotateCw className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => handleDismiss(issue.id)}
                                    aria-label="Dismiss"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                        <p className="text-xs text-destructive">{issue.errorMessage}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
