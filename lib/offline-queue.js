'use client';

import { onlineManager } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    enqueueMutation,
    listQueuedMutations,
    removeMutation,
    addSyncIssue,
    listSyncIssues,
    removeSyncIssue,
} from '@/lib/offline-db';
import { getMutationHandler } from '@/lib/mutation-registry';

let pendingCount = 0;
const countListeners = new Set();

function setPendingCount(count) {
    pendingCount = count;
    countListeners.forEach((listener) => listener());
}

let syncIssues = [];
const issueListeners = new Set();

function setSyncIssues(issues) {
    syncIssues = issues;
    issueListeners.forEach((listener) => listener());
}

/**
 * Subscribes to changes in the list of permanently-failed queued mutations.
 *
 * @param {() => void} listener
 * @returns {() => void} Unsubscribe function
 */
export function subscribeSyncIssues(listener) {
    issueListeners.add(listener);
    return () => issueListeners.delete(listener);
}

/**
 * Current list of queued mutations that were rejected by the server on replay.
 *
 * @returns {{ id: number, type: string, payload: object, label: string, errorMessage: string, retryable: boolean, createdAt: number }[]}
 */
export function getSyncIssues() {
    return syncIssues;
}

async function refreshSyncIssues() {
    setSyncIssues(await listSyncIssues());
}

/**
 * Humanizes a mutation type into a display label, appending a name when the payload
 * already happens to carry one - no new data collection at any call site.
 *
 * @param {string} type - Registered mutation type, e.g. 'deleteStatus'
 * @param {object} payload - The mutation's payload
 * @returns {string} Display label, e.g. "Delete status" or "Update task - Buy milk"
 */
function buildIssueLabel(type, payload) {
    const spaced = type.replace(/([A-Z])/g, ' $1').toLowerCase();
    const humanized = spaced.charAt(0).toUpperCase() + spaced.slice(1);
    const name = payload?.fields?.name ?? payload?.fields?.title;
    return name ? `${humanized} - ${name}` : humanized;
}

/**
 * Classifies a rejection message as retryable (a generic, likely-transient failure)
 * or permanent (a named business-rule/validation rejection - retrying won't help).
 *
 * @param {string} errorMessage
 * @returns {boolean} Whether a retry is worth offering
 */
function classifyError(errorMessage) {
    return /^(Failed to |Unexpected error)/.test(errorMessage ?? '');
}

/**
 * Subscribes to changes in how many mutations are currently queued.
 *
 * @param {() => void} listener
 * @returns {() => void} Unsubscribe function
 */
export function subscribePendingCount(listener) {
    countListeners.add(listener);
    return () => countListeners.delete(listener);
}

/**
 * Current number of mutations waiting in the outbox.
 *
 * @returns {number}
 */
export function getPendingCount() {
    return pendingCount;
}

async function refreshPendingCount() {
    const queued = await listQueuedMutations();
    setPendingCount(queued.length);
}

/**
 * Runs a mutation now if online, otherwise queues it for later replay.
 * A network-level failure (connection drops mid-flight, before the browser's
 * online/offline event fires) queues the mutation instead of throwing; a
 * real server-side rejection is returned as-is, exactly like today.
 *
 * @param {string} type - Registered mutation type (see lib/mutation-registry.js)
 * @param {object} payload - Arguments for the mutation handler
 * @returns {Promise<{ error: string|null, queued?: boolean }>}
 */
export async function enqueueOrRun(type, payload) {
    if (!onlineManager.isOnline()) {
        await enqueueMutation(type, payload);
        await refreshPendingCount();
        return { error: null, queued: true };
    }

    const handler = getMutationHandler(type);

    try {
        return await handler(payload);
    } catch {
        await enqueueMutation(type, payload);
        await refreshPendingCount();
        return { error: null, queued: true };
    }
}

/**
 * Runs a batch of reorder mutations (one per shifted item) through the offline outbox.
 * Every caller reorders a flat list of same-type siblings (spaces, lists, sublists,
 * statuses) the same way - this is shared so the loop and its shape live in one place.
 *
 * @param {object[]} items - Items whose position changed, in their new order
 * @param {string} type - Registered mutation type, e.g. 'updateSpace'
 * @param {(item: object) => object} buildPayload - Builds the mutation payload for one item
 * @returns {Promise<{ error: string|null, queued?: boolean }[]>} One result per item
 */
export async function enqueueReorder(items, type, buildPayload) {
    const results = [];
    for (const item of items) {
        results.push(await enqueueOrRun(type, buildPayload(item)));
    }
    return results;
}

let processing = false;

/**
 * Replays queued mutations in order (oldest first). Stops at the first one
 * that still fails for a network reason, preserving order for the next
 * reconnect attempt. A mutation rejected by the server on replay (not a
 * network failure) is removed from the queue but recorded as a sync issue -
 * never retried forever, never dropped without a trace.
 *
 * @returns {Promise<void>}
 */
export async function processQueue() {
    if (processing || !onlineManager.isOnline()) return;
    processing = true;

    try {
        const queued = await listQueuedMutations();
        for (const mutation of queued) {
            const handler = getMutationHandler(mutation.type);
            if (!handler) {
                await removeMutation(mutation.id);
                continue;
            }

            let result;
            try {
                result = await handler(mutation.payload);
            } catch {
                break;
            }

            if (result?.error) {
                await addSyncIssue({
                    type: mutation.type,
                    payload: mutation.payload,
                    label: buildIssueLabel(mutation.type, mutation.payload),
                    errorMessage: result.error,
                    retryable: classifyError(result.error),
                });
                await refreshSyncIssues();
                toast.error('A queued change could not be synced - see Settings for details');
            }
            await removeMutation(mutation.id);
        }
    } finally {
        await refreshPendingCount();
        processing = false;
    }
}

/**
 * Re-attempts a previously-failed queued mutation. On success it's cleared;
 * on another failure the record is replaced with the fresh error.
 *
 * @param {number} id - Sync issue id, from getSyncIssues()
 * @returns {Promise<{ error: string|null }>}
 */
export async function retrySyncIssue(id) {
    const issue = syncIssues.find((existingIssue) => existingIssue.id === id);
    if (!issue) return { error: 'Issue no longer exists' };

    const handler = getMutationHandler(issue.type);
    const result = await handler(issue.payload);

    await removeSyncIssue(id);
    if (result?.error) {
        await addSyncIssue({
            type: issue.type,
            payload: issue.payload,
            label: issue.label,
            errorMessage: result.error,
            retryable: classifyError(result.error),
        });
    }
    await refreshSyncIssues();

    return result;
}

/**
 * Permanently discards a sync issue without retrying it.
 *
 * @param {number} id - Sync issue id, from getSyncIssues()
 * @returns {Promise<void>}
 */
export async function dismissSyncIssue(id) {
    await removeSyncIssue(id);
    await refreshSyncIssues();
}

if (typeof window !== 'undefined') {
    // onlineManager defaults to `true` until the first online/offline event fires -
    // correct it immediately so a page loaded while offline is reported accurately.
    onlineManager.setOnline(navigator.onLine);
    onlineManager.subscribe((isOnline) => {
        if (isOnline) processQueue();
    });
    refreshPendingCount();
    refreshSyncIssues();
    processQueue();
    // Best-effort: helps the outbox survive storage eviction under pressure. No UI
    // needed either way - browsers that prompt handle their own permission dialog.
    navigator.storage?.persist?.();
}
