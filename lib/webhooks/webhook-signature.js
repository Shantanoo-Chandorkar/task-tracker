import { createHmac, randomBytes } from 'node:crypto';

const SECRET_PREFIX = 'whsec_';
const SECRET_BYTES = 32;

/**
 * Creates a new signing secret in the Standard Webhooks format (`whsec_` + base64 of 32 random bytes).
 *
 * @returns {string} The secret, shown to the owner once and stored encrypted in Vault.
 */
export function generateWebhookSecret() {
    return `${SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString('base64')}`;
}

/**
 * Computes one Standard Webhooks signature: base64 HMAC-SHA256 over `id.timestamp.body`, tagged `v1,`.
 *
 * @param {string} secret - Signing secret in `whsec_<base64>` form.
 * @param {string} eventId - Stable event id, sent as the `webhook-id` header.
 * @param {number} timestampSeconds - Unix seconds, sent as the `webhook-timestamp` header.
 * @param {string} requestBody - The exact request body string that will be sent.
 * @returns {string} The signature in `v1,<base64>` form.
 * @throws {Error} If the secret is not in `whsec_<base64>` form.
 */
export function computeSignature(secret, eventId, timestampSeconds, requestBody) {
    if (typeof secret !== 'string' || !secret.startsWith(SECRET_PREFIX))
        throw new Error('Webhook secret is not in whsec_ format');
    const secretKey = Buffer.from(secret.slice(SECRET_PREFIX.length), 'base64');
    const signature = createHmac('sha256', secretKey)
        .update(`${eventId}.${timestampSeconds}.${requestBody}`)
        .digest('base64');
    return `v1,${signature}`;
}

/**
 * Builds the signature headers for one attempt; a still-valid rotated-out secret adds a second signature.
 *
 * @param {object} signingInput - `{ eventId, timestampSeconds, requestBody, signingSecrets }`: the event id, attempt
 *   time, the exact body string, and the current secret first followed by an optional previous one.
 * @returns {{ 'webhook-id': string, 'webhook-timestamp': string, 'webhook-signature': string }} Headers to send.
 */
export function buildSignedHeaders({ eventId, timestampSeconds, requestBody, signingSecrets }) {
    const signatures = signingSecrets.map((secret) =>
        computeSignature(secret, eventId, timestampSeconds, requestBody),
    );
    return {
        'webhook-id': eventId,
        'webhook-timestamp': String(timestampSeconds),
        'webhook-signature': signatures.join(' '),
    };
}
