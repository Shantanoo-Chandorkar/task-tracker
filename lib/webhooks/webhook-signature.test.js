// @vitest-environment node
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildSignedHeaders, computeSignature, generateWebhookSecret } from './webhook-signature';

// Test vector published with the Standard Webhooks specification
const SPEC_SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const SPEC_EVENT_ID = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
const SPEC_TIMESTAMP = 1614265330;
const SPEC_BODY = '{"test": 2432232314}';
const SPEC_SIGNATURE = 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=';

describe('computeSignature', () => {
    it('matches the Standard Webhooks specification test vector', () => {
        expect(computeSignature(SPEC_SECRET, SPEC_EVENT_ID, SPEC_TIMESTAMP, SPEC_BODY)).toBe(
            SPEC_SIGNATURE,
        );
    });

    it('signs id.timestamp.requestBody so changing any part changes the signature', () => {
        const baseline = computeSignature(SPEC_SECRET, SPEC_EVENT_ID, SPEC_TIMESTAMP, SPEC_BODY);
        expect(computeSignature(SPEC_SECRET, 'msg_other', SPEC_TIMESTAMP, SPEC_BODY)).not.toBe(
            baseline,
        );
        expect(
            computeSignature(SPEC_SECRET, SPEC_EVENT_ID, SPEC_TIMESTAMP + 1, SPEC_BODY),
        ).not.toBe(baseline);
        expect(
            computeSignature(SPEC_SECRET, SPEC_EVENT_ID, SPEC_TIMESTAMP, `${SPEC_BODY} `),
        ).not.toBe(baseline);
    });

    it('rejects a secret that is not in whsec_ format', () => {
        expect(() =>
            computeSignature('plain-secret', SPEC_EVENT_ID, SPEC_TIMESTAMP, SPEC_BODY),
        ).toThrow();
        expect(() =>
            computeSignature(undefined, SPEC_EVENT_ID, SPEC_TIMESTAMP, SPEC_BODY),
        ).toThrow();
    });
});

describe('buildSignedHeaders', () => {
    it('returns the three Standard Webhooks headers', () => {
        const headers = buildSignedHeaders({
            eventId: SPEC_EVENT_ID,
            timestampSeconds: SPEC_TIMESTAMP,
            requestBody: SPEC_BODY,
            signingSecrets: [SPEC_SECRET],
        });
        expect(headers).toEqual({
            'webhook-id': SPEC_EVENT_ID,
            'webhook-timestamp': '1614265330',
            'webhook-signature': SPEC_SIGNATURE,
        });
    });

    it('sends both signatures, current firstSecret, while a previous secret is valid', () => {
        const previousSecret = generateWebhookSecret();
        const headers = buildSignedHeaders({
            eventId: SPEC_EVENT_ID,
            timestampSeconds: SPEC_TIMESTAMP,
            requestBody: SPEC_BODY,
            signingSecrets: [SPEC_SECRET, previousSecret],
        });
        const [currentSignature, previousSignature] = headers['webhook-signature'].split(' ');
        expect(currentSignature).toBe(SPEC_SIGNATURE);
        expect(previousSignature).toBe(
            computeSignature(previousSecret, SPEC_EVENT_ID, SPEC_TIMESTAMP, SPEC_BODY),
        );
    });
});

describe('generateWebhookSecret', () => {
    it('produces a unique whsec_ secret carrying 32 random bytes, long enough for the database check', () => {
        const firstSecret = generateWebhookSecret();
        expect(firstSecret).not.toBe(generateWebhookSecret());
        expect(firstSecret.startsWith('whsec_')).toBe(true);
        expect(firstSecret.length).toBeGreaterThanOrEqual(24);
        expect(Buffer.from(firstSecret.slice('whsec_'.length), 'base64')).toHaveLength(32);
    });

    it('produces a secret that verifies with an independent HMAC computation', () => {
        const secret = generateWebhookSecret();
        const expected = createHmac('sha256', Buffer.from(secret.slice('whsec_'.length), 'base64'))
            .update('evt.100.{}')
            .digest('base64');
        expect(computeSignature(secret, 'evt', 100, '{}')).toBe(`v1,${expected}`);
    });
});
