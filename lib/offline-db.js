'use client';

const DB_NAME = 'task-tracker-offline';
const DB_VERSION = 2;
const STORE_NAME = 'outbox';
const ISSUES_STORE_NAME = 'sync-issues';
const MAX_SYNC_ISSUES = 50;

let dbPromise = null;

/**
 * Opens (and lazily creates) the offline outbox database. Cached across calls
 * so repeated queue operations don't reopen the connection every time.
 *
 * @returns {Promise<IDBDatabase>}
 */
function openOutboxDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(ISSUES_STORE_NAME)) {
                db.createObjectStore(ISSUES_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            // Without this, an older tab's open connection blocks a newer tab's version
            // bump forever - every queue operation there would hang indefinitely.
            db.onversionchange = () => {
                db.close();
                dbPromise = null;
            };
            resolve(db);
        };
        request.onerror = () => reject(request.error);
    });

    return dbPromise;
}

/**
 * Adds a mutation to the outbox for later replay.
 *
 * @param {string} type - Registered mutation type (see lib/mutation-registry.js)
 * @param {object} payload - Arguments the mutation handler needs to run
 * @returns {Promise<number>} The queued record's id
 */
export async function enqueueMutation(type, payload) {
    const db = await openOutboxDb();
    return new Promise((resolve, reject) => {
        const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
        const request = store.add({ type, payload, createdAt: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Lists every queued mutation, oldest first.
 *
 * @returns {Promise<{ id: number, type: string, payload: object, createdAt: number }[]>}
 */
export async function listQueuedMutations() {
    const db = await openOutboxDb();
    return new Promise((resolve, reject) => {
        const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result.sort((a, b) => a.createdAt - b.createdAt));
        request.onerror = () => reject(request.error);
    });
}

/**
 * Removes a mutation from the outbox - called once it's synced, or once it's
 * been permanently rejected by the server.
 *
 * @param {number} id - Record id returned by enqueueMutation
 * @returns {Promise<void>}
 */
export async function removeMutation(id) {
    const db = await openOutboxDb();
    return new Promise((resolve, reject) => {
        const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Records a mutation that was permanently rejected by the server on replay, so it's
 * reviewable later instead of vanishing. Trims to the most recent records to bound growth.
 *
 * @param {{ type: string, payload: object, label: string, errorMessage: string, retryable: boolean }} issue
 * @returns {Promise<number>} The stored record's id
 */
export async function addSyncIssue(issue) {
    const db = await openOutboxDb();
    const id = await new Promise((resolve, reject) => {
        const store = db.transaction(ISSUES_STORE_NAME, 'readwrite').objectStore(ISSUES_STORE_NAME);
        const request = store.add({ ...issue, createdAt: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    const issues = await listSyncIssues();
    const excess = issues.length - MAX_SYNC_ISSUES;
    if (excess > 0) {
        await Promise.all(issues.slice(0, excess).map((oldIssue) => removeSyncIssue(oldIssue.id)));
    }

    return id;
}

/**
 * Lists every stored sync issue, oldest first.
 *
 * @returns {Promise<{ id: number, type: string, payload: object, label: string, errorMessage: string, retryable: boolean, createdAt: number }[]>}
 */
export async function listSyncIssues() {
    const db = await openOutboxDb();
    return new Promise((resolve, reject) => {
        const store = db.transaction(ISSUES_STORE_NAME, 'readonly').objectStore(ISSUES_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result.sort((a, b) => a.createdAt - b.createdAt));
        request.onerror = () => reject(request.error);
    });
}

/**
 * Removes a stored sync issue - called on dismiss, or before re-adding a fresh record on retry.
 *
 * @param {number} id - Record id returned by addSyncIssue
 * @returns {Promise<void>}
 */
export async function removeSyncIssue(id) {
    const db = await openOutboxDb();
    return new Promise((resolve, reject) => {
        const store = db.transaction(ISSUES_STORE_NAME, 'readwrite').objectStore(ISSUES_STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
