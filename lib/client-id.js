/**
 * Makes the id for a row the user is about to create, so a retry of a lost request can find the row the first try made.
 * Returns nothing where the browser lacks `crypto.randomUUID` (plain-HTTP pages), and the server then makes the id.
 *
 * @returns {string|undefined} A new UUID, or undefined when the browser cannot make one.
 */
export function createClientId() {
    return globalThis.crypto?.randomUUID?.();
}
