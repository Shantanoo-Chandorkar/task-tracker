'use client';

import { onlineManager } from '@tanstack/react-query';
import { toast } from 'sonner';
import { enqueueMutation, listQueuedMutations, removeMutation } from '@/lib/offline-db';
import { getMutationHandler } from '@/lib/mutation-registry';

let pendingCount = 0;
const countListeners = new Set();

function setPendingCount(count) {
    pendingCount = count;
    countListeners.forEach((listener) => listener());
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
 * statuses) the same way — this is shared so the loop and its shape live in one place.
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
 * network failure) is removed and surfaced via a toast — never retried
 * forever, never dropped silently.
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
                toast.error(`A queued change could not be synced: ${result.error}`);
            }
            await removeMutation(mutation.id);
        }
    } finally {
        await refreshPendingCount();
        processing = false;
    }
}

if (typeof window !== 'undefined') {
    // onlineManager defaults to `true` until the first online/offline event fires —
    // correct it immediately so a page loaded while offline is reported accurately.
    onlineManager.setOnline(navigator.onLine);
    onlineManager.subscribe((isOnline) => {
        if (isOnline) processQueue();
    });
    refreshPendingCount();
    processQueue();
}
