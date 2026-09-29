// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateWebhookEndpointInput } from './webhook-endpoint-input';

const validFields = {
    name: 'Zapier',
    url: 'https://hooks.example.com/catch/1',
    event_types: ['task.created', 'task.completed'],
    payload_level: 'minimal',
};

describe('validateWebhookEndpointInput (create)', () => {
    it('accepts valid fields and returns only the allowlisted ones', () => {
        const validation = validateWebhookEndpointInput({
            ...validFields,
            space_id: 'other-space',
            secret_id: 'x',
            enabled: false,
            consecutive_failures: 99,
        });
        expect(validation).toEqual({
            isValid: true,
            cleanedFields: {
                name: 'Zapier',
                url: 'https://hooks.example.com/catch/1',
                event_types: ['task.created', 'task.completed'],
                payload_level: 'minimal',
            },
        });
    });

    it('defaults the name to Webhook and the level to standard', () => {
        const validation = validateWebhookEndpointInput({
            url: validFields.url,
            event_types: ['task.*'],
        });
        expect(validation.cleanedFields).toMatchObject({
            name: 'Webhook',
            payload_level: 'standard',
        });
    });

    it('strips tags from the name and trims it', () => {
        const validation = validateWebhookEndpointInput({
            ...validFields,
            name: '  <b>Make</b>  ',
        });
        expect(validation.cleanedFields.name).toBe('Make');
    });

    it('rejects a name over 100 characters with the shared length code', () => {
        const validation = validateWebhookEndpointInput({ ...validFields, name: 'a'.repeat(101) });
        expect(validation).toMatchObject({ isValid: false, code: 'INPUT_TOO_LONG' });
    });

    it.each([
        ['http://hooks.example.com/x', 'WEBHOOK_URL_NOT_HTTPS'],
        ['https://localhost/x', 'WEBHOOK_URL_BLOCKED'],
        ['https://10.0.0.1/x', 'WEBHOOK_URL_BLOCKED'],
        ['not a url', 'WEBHOOK_URL_INVALID'],
        ['', 'WEBHOOK_URL_INVALID'],
        [undefined, 'WEBHOOK_URL_INVALID'],
    ])('rejects url %s with %s', (url, expectedCode) => {
        expect(validateWebhookEndpointInput({ ...validFields, url })).toMatchObject({
            isValid: false,
            code: expectedCode,
        });
    });

    it.each([[[]], [undefined], ['task.created'], [['task.exploded']], [['task.created', 'nope']]])(
        'rejects event types %j',
        (eventTypes) => {
            expect(
                validateWebhookEndpointInput({ ...validFields, event_types: eventTypes }),
            ).toMatchObject({
                isValid: false,
                code: 'WEBHOOK_EVENT_TYPES_INVALID',
            });
        },
    );

    it('rejects webhook.test as a subscription, because it is never subscribed', () => {
        expect(
            validateWebhookEndpointInput({ ...validFields, event_types: ['webhook.test'] }).isValid,
        ).toBe(false);
    });

    it('removes duplicate event types', () => {
        const validation = validateWebhookEndpointInput({
            ...validFields,
            event_types: ['task.created', 'task.created'],
        });
        expect(validation.cleanedFields.event_types).toEqual(['task.created']);
    });

    it('rejects an unknown payload level', () => {
        expect(
            validateWebhookEndpointInput({ ...validFields, payload_level: 'everything' }),
        ).toMatchObject({
            isValid: false,
            code: 'WEBHOOK_PAYLOAD_LEVEL_INVALID',
        });
    });

    it.each([null, undefined, 'text', 5])('rejects non-object input %j', (fields) => {
        expect(validateWebhookEndpointInput(fields)).toMatchObject({
            isValid: false,
            code: 'WEBHOOK_INPUT_INVALID',
        });
    });

    it('normalises the URL it stores', () => {
        const validation = validateWebhookEndpointInput({
            ...validFields,
            url: '  https://Hooks.Example.com  ',
        });
        expect(validation.cleanedFields.url).toBe('https://hooks.example.com/');
    });
});

describe('validateWebhookEndpointInput (partial update)', () => {
    it('checks and returns only the fields that were sent', () => {
        expect(
            validateWebhookEndpointInput({ payload_level: 'full' }, { isPartial: true }),
        ).toEqual({
            isValid: true,
            cleanedFields: { payload_level: 'full' },
        });
    });

    it('returns no values when nothing recognised was sent', () => {
        expect(
            validateWebhookEndpointInput({ secret_id: 'x', enabled: true }, { isPartial: true }),
        ).toEqual({ isValid: true, cleanedFields: {} });
    });

    it('still validates a field that is present', () => {
        expect(
            validateWebhookEndpointInput({ url: 'http://hooks.example.com' }, { isPartial: true }),
        ).toMatchObject({ isValid: false, code: 'WEBHOOK_URL_NOT_HTTPS' });
        expect(
            validateWebhookEndpointInput({ event_types: [] }, { isPartial: true }),
        ).toMatchObject({ isValid: false, code: 'WEBHOOK_EVENT_TYPES_INVALID' });
    });
});
