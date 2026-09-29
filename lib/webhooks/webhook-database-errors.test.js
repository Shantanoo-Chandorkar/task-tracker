// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { toWebhookFailure } from './webhook-database-errors';

describe('toWebhookFailure', () => {
    it.each([
        'WEBHOOK_ENDPOINT_LIMIT',
        'WEBHOOK_ENDPOINT_NOT_FOUND',
        'WEBHOOK_ENDPOINT_DISABLED',
        'WEBHOOK_TEST_RATE_LIMITED',
        'WEBHOOK_DELIVERY_NOT_FOUND',
        'WEBHOOK_RETRY_NOT_ALLOWED',
        'WEBHOOK_RETRY_TOO_SOON',
    ])('maps %s to its stable code with a friendly message', (code) => {
        const failure = toWebhookFailure({ message: `${code}` }, 'fallback');
        expect(failure).toMatchObject({ code, isKnown: true });
        expect(failure.error).not.toContain('WEBHOOK_');
    });

    it('maps a unique violation to the duplicate URL code', () => {
        expect(
            toWebhookFailure({ code: '23505', message: 'duplicate key ...' }, 'fallback'),
        ).toMatchObject({
            code: 'WEBHOOK_URL_DUPLICATE',
            isKnown: true,
        });
    });

    it('reports anything else generically and never echoes the database text', () => {
        const failure = toWebhookFailure(
            { code: 'XX000', message: 'relation "vault.secrets" permission denied' },
            'Failed to save webhook',
        );
        expect(failure).toEqual({
            error: 'Failed to save webhook',
            code: 'WEBHOOK_ACTION_FAILED',
            isKnown: false,
        });
    });

    it('handles a missing error', () => {
        expect(toWebhookFailure(undefined, 'fallback').code).toBe('WEBHOOK_ACTION_FAILED');
    });
});
