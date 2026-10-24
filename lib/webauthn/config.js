/**
 * Single source of truth for this app's WebAuthn Relying Party identity. Derived entirely
 * from SITE_URL - never hardcoded, never read from a request header - so the same code runs
 * correctly against localhost in dev and the real production domain (decision 6 in
 * docs/architecture-decisions/webauthn-passkeys.md).
 */
export const WEBAUTHN_RP_NAME = 'Task Tracker';

/**
 * The origin every WebAuthn ceremony (registration and authentication) must be bound to.
 *
 * @returns {string} The app's own origin, exactly as SITE_URL is configured.
 */
export function getWebauthnOrigin() {
    return process.env.SITE_URL;
}

/**
 * The Relying Party ID every passkey is cryptographically scoped to.
 *
 * @returns {string} The bare hostname of SITE_URL.
 */
export function getWebauthnRpId() {
    return new URL(process.env.SITE_URL).hostname;
}
