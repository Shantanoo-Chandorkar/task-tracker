// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { CIRCUIT_BREAKER_FAILURES, MAX_DELIVERY_ATTEMPTS } from './delivery-retry-policy';
import { runWebhookSweep } from './webhook-delivery-runner';

const NOW = Date.parse('2026-01-01T12:00:00.000Z');
const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const OK_RESPONSE = { statusCode: 200, transportErrorClass: null, retryAfterSeconds: null };
const responseWithStatus = (statusCode) => ({
    statusCode,
    transportErrorClass: null,
    retryAfterSeconds: null,
});

const buildClaim = (overrides = {}) => ({
    delivery_id: 'delivery-1',
    attempt_count: 1,
    endpoint_id: 'endpoint-1',
    endpoint_url: 'https://hooks.example.com/x',
    payload_level: 'standard',
    endpoint_consecutive_failures: 0,
    endpoint_healthy_since: new Date(NOW - 60_000).toISOString(),
    event_id: 'event-1',
    space_id: 'space-1',
    resource_type: 'task',
    resource_id: 'task-1',
    event_type: 'task.created',
    schema_version: 1,
    correlation_id: 'corr-1',
    actor_id: null,
    source: 'user',
    occurred_at: '2026-01-01T11:59:00.000Z',
    payload: { task: { id: 'task-1', title: 'Hello', description: 'private' }, changes: null },
    ...overrides,
});

/** Fake admin client: hands out the given claims once, then nothing, and records every completion call. */
function buildFakeClient({
    claims,
    secretRow = { current_secret: SECRET, previous_secret: null },
    wasRecorded = true,
}) {
    const completions = [];
    let hasClaimed = false;
    const rpc = vi.fn((functionName, rpcArguments) => {
        if (functionName === 'claim_webhook_deliveries') {
            const handedOut = hasClaimed ? [] : claims;
            hasClaimed = true;
            return Promise.resolve({ data: handedOut, error: null });
        }
        if (functionName === 'get_webhook_endpoint_secrets')
            return {
                single: () =>
                    Promise.resolve({
                        data: secretRow,
                        error: secretRow ? null : { message: 'x' },
                    }),
            };
        completions.push(rpcArguments);
        return Promise.resolve({ data: wasRecorded, error: null });
    });
    return { client: { rpc }, completions };
}

const sweep = (client, sendRequest) =>
    runWebhookSweep({ adminClient: client, sendRequest, nowFn: () => NOW, randomFn: () => 0.5 });

describe('runWebhookSweep', () => {
    it('signs the projected body and records a delivered result on 2xx', async () => {
        const { client, completions } = buildFakeClient({ claims: [buildClaim()] });
        const sendRequest = vi.fn().mockResolvedValue(OK_RESPONSE);

        const summary = await sweep(client, sendRequest);

        expect(summary).toEqual({ claimed: 1, countByOutcome: { delivered: 1 } });
        const sentRequest = sendRequest.mock.calls[0][0];
        expect(sentRequest.url).toBe('https://hooks.example.com/x');
        expect(sentRequest.signatureHeaders['webhook-id']).toBe('event-1');
        expect(sentRequest.signatureHeaders['webhook-signature']).toMatch(/^v1,/);
        expect(JSON.parse(sentRequest.requestBody).data.task.title).toBe('Hello');
        expect(sentRequest.requestBody).not.toContain('private');
        expect(completions[0]).toMatchObject({
            p_status: 'delivered',
            p_counts_as_failure: false,
            p_disable_reason: null,
        });
    });

    it('schedules a retry for a 500 and passes the status code through', async () => {
        const { client, completions } = buildFakeClient({ claims: [buildClaim()] });
        const summary = await sweep(client, vi.fn().mockResolvedValue(responseWithStatus(500)));

        expect(summary.countByOutcome).toEqual({ retrying: 1 });
        expect(completions[0]).toMatchObject({
            p_status: 'retrying',
            p_status_code: 500,
            p_counts_as_failure: true,
        });
        expect(completions[0].p_next_attempt_at).toBe(new Date(NOW + 30_000).toISOString());
    });

    it('fails a permanent 404 without a retry time', async () => {
        const { client, completions } = buildFakeClient({ claims: [buildClaim()] });
        await sweep(client, vi.fn().mockResolvedValue(responseWithStatus(404)));
        expect(completions[0]).toMatchObject({ p_status: 'failed', p_next_attempt_at: null });
    });

    it('disables the endpoint with reason gone on 410', async () => {
        const { client, completions } = buildFakeClient({ claims: [buildClaim()] });
        await sweep(client, vi.fn().mockResolvedValue(responseWithStatus(410)));
        expect(completions[0]).toMatchObject({ p_status: 'failed', p_disable_reason: 'gone' });
    });

    it('opens the circuit breaker when failures and outage length both cross the threshold', async () => {
        const claim = buildClaim({
            endpoint_consecutive_failures: CIRCUIT_BREAKER_FAILURES,
            endpoint_healthy_since: new Date(NOW - 7 * 60 * 60 * 1000).toISOString(),
        });
        const { client, completions } = buildFakeClient({ claims: [claim] });
        await sweep(client, vi.fn().mockResolvedValue(responseWithStatus(503)));
        expect(completions[0].p_disable_reason).toBe('circuit_breaker');
    });

    it('dead-letters a delivery on its last attempt', async () => {
        const claim = buildClaim({ attempt_count: MAX_DELIVERY_ATTEMPTS });
        const { client, completions } = buildFakeClient({ claims: [claim] });
        await sweep(client, vi.fn().mockResolvedValue(responseWithStatus(503)));
        expect(completions[0]).toMatchObject({ p_status: 'failed', p_next_attempt_at: null });
    });

    it('turns a thrown send into an unknown transport failure and keeps going', async () => {
        const claims = [
            buildClaim(),
            buildClaim({ delivery_id: 'delivery-2', event_id: 'event-2' }),
        ];
        const { client, completions } = buildFakeClient({ claims });
        const sendRequest = vi
            .fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce(OK_RESPONSE);
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

        const summary = await sweep(client, sendRequest);

        expect(summary.countByOutcome).toEqual({ retrying: 1, delivered: 1 });
        expect(completions.find((call) => call.p_delivery_id === 'delivery-1')).toMatchObject({
            p_error_class: 'unknown',
        });
        errorLog.mockRestore();
    });

    it('retries without sending when the signing secret cannot be read', async () => {
        const { client, completions } = buildFakeClient({
            claims: [buildClaim()],
            secretRow: null,
        });
        const sendRequest = vi.fn();
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

        await sweep(client, sendRequest);

        expect(sendRequest).not.toHaveBeenCalled();
        expect(completions[0]).toMatchObject({ p_status: 'retrying', p_error_class: 'unknown' });
        errorLog.mockRestore();
    });

    it('signs with both secrets while a previous one is valid', async () => {
        const { client } = buildFakeClient({
            claims: [buildClaim()],
            secretRow: {
                current_secret: SECRET,
                previous_secret: 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            },
        });
        const sendRequest = vi.fn().mockResolvedValue(OK_RESPONSE);
        await sweep(client, sendRequest);
        const signatureHeader = sendRequest.mock.calls[0][0].signatureHeaders['webhook-signature'];
        expect(signatureHeader.split(' ')).toHaveLength(2);
    });

    it('reports lease_lost when another worker already finished the delivery', async () => {
        const { client } = buildFakeClient({ claims: [buildClaim()], wasRecorded: false });
        const summary = await sweep(client, vi.fn().mockResolvedValue(OK_RESPONSE));
        expect(summary.countByOutcome).toEqual({ lease_lost: 1 });
    });

    it('returns a claim_failed error instead of throwing when claiming fails', async () => {
        const client = {
            rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
        };
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await sweep(client, vi.fn())).toEqual({ error: 'claim_failed' });
        errorLog.mockRestore();
    });

    it('does nothing when no delivery is due', async () => {
        const { client } = buildFakeClient({ claims: [] });
        expect(await sweep(client, vi.fn())).toEqual({ claimed: 0, countByOutcome: {} });
    });

    it('never logs the endpoint URL or secret', async () => {
        const { client } = buildFakeClient({ claims: [buildClaim()] });
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        await sweep(client, vi.fn().mockRejectedValue(new Error('boom')));
        const logged = JSON.stringify(errorLog.mock.calls);
        expect(logged).not.toContain('hooks.example.com');
        expect(logged).not.toContain(SECRET);
        errorLog.mockRestore();
    });
});
