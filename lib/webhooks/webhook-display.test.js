// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    EVENT_OPTIONS,
    describeDelivery,
    describeEndpointStatus,
    describeEventType,
    maskWebhookUrl,
    summarizeEventTypes,
} from './webhook-display';

describe('maskWebhookUrl', () => {
    it('hides the path and query, which often carry a secret token', () => {
        expect(maskWebhookUrl('https://hooks.zapier.com/hooks/catch/123/abc?token=secret')).toBe(
            'https://hooks.zapier.com/…',
        );
        expect(maskWebhookUrl('https://hooks.example.com/secret-path')).not.toContain(
            'secret-path',
        );
    });

    it('shows a bare origin as is', () => {
        expect(maskWebhookUrl('https://hooks.example.com/')).toBe('https://hooks.example.com');
    });

    it('does not throw on garbage', () => {
        expect(maskWebhookUrl('not a url')).toBe('Invalid address');
    });
});

describe('event labels', () => {
    it('offers one option per subscribable task event, all labelled', () => {
        expect(EVENT_OPTIONS).toHaveLength(9);
        for (const option of EVENT_OPTIONS) expect(option.label).not.toContain('.');
    });

    it('labels the test event and falls back to the raw type for an unknown one', () => {
        expect(describeEventType('webhook.test')).toBe('Test event');
        expect(describeEventType('list.created')).toBe('list.created');
    });

    it('summarises subscriptions', () => {
        expect(summarizeEventTypes(['task.*'])).toBe('All task events');
        expect(summarizeEventTypes(['task.completed'])).toBe('Task completed');
        expect(summarizeEventTypes(['task.created', 'task.moved'])).toBe('2 events');
    });
});

describe('describeEndpointStatus', () => {
    it('is active with no explanation when enabled', () => {
        expect(describeEndpointStatus({ enabled: true, disabled_reason: null })).toEqual({
            label: 'Active',
            tone: 'active',
            detail: null,
        });
    });

    it.each([
        ['manual', 'Off', 'off'],
        ['circuit_breaker', 'Paused', 'paused'],
        ['backlog', 'Paused', 'paused'],
        ['gone', 'Paused', 'paused'],
    ])('explains a webhook disabled for %s', (disabledReason, expectedLabel, expectedTone) => {
        const status = describeEndpointStatus({ enabled: false, disabled_reason: disabledReason });
        expect(status).toMatchObject({ label: expectedLabel, tone: expectedTone });
        expect(status.detail.length).toBeGreaterThan(10);
    });

    it('still explains an unknown reason', () => {
        expect(
            describeEndpointStatus({ enabled: false, disabled_reason: 'something_new' }).label,
        ).toBe('Off');
    });
});

describe('describeDelivery', () => {
    const buildDelivery = (overrides) => ({
        status: 'pending',
        last_status_code: null,
        last_error_class: null,
        ...overrides,
    });

    it('maps each status to a label and tone', () => {
        expect(
            describeDelivery(buildDelivery({ status: 'delivered', last_status_code: 200 })),
        ).toEqual({
            label: 'Delivered',
            tone: 'good',
            reason: null,
        });
        expect(describeDelivery(buildDelivery({ status: 'pending' }))).toMatchObject({
            label: 'Queued',
            tone: 'pending',
        });
        expect(describeDelivery(buildDelivery({ status: 'processing' }))).toMatchObject({
            label: 'Sending',
        });
    });

    it('explains a failure by status code, or by error class when no response arrived', () => {
        expect(
            describeDelivery(buildDelivery({ status: 'failed', last_status_code: 500 })),
        ).toEqual({
            label: 'Failed',
            tone: 'bad',
            reason: 'Receiver answered HTTP 500',
        });
        expect(
            describeDelivery(buildDelivery({ status: 'failed', last_error_class: 'timeout' }))
                .reason,
        ).toBe('Timed out');
        expect(
            describeDelivery(buildDelivery({ status: 'retrying', last_error_class: 'tls' })).reason,
        ).toBe('Certificate problem');
    });

    it('never shows raw error text for an unknown class', () => {
        expect(
            describeDelivery(
                buildDelivery({ status: 'failed', last_error_class: 'weird_new_thing' }),
            ).reason,
        ).toBe('Unexpected error');
    });
});
