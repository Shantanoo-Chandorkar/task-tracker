import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    createSessionClient: vi.fn(),
    createAdminClient: vi.fn(),
    resolveSpacePermission: vi.fn(),
    resolvePublicAddresses: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createSessionClient }));
vi.mock('@/lib/supabase/admin', () => ({ createClient: mocks.createAdminClient }));
vi.mock('@/lib/permissions/space-permissions', () => ({
    resolveSpacePermission: mocks.resolveSpacePermission,
}));
vi.mock('@/lib/webhooks/webhook-url-guard', async (importOriginal) => ({
    ...(await importOriginal()),
    resolvePublicAddresses: mocks.resolvePublicAddresses,
}));

const {
    createWebhookEndpoint,
    deleteWebhookEndpoint,
    listWebhookDeliveries,
    listWebhookEndpoints,
    retryWebhookDelivery,
    rotateWebhookSecret,
    sendWebhookTestEvent,
    setWebhookEndpointEnabled,
    updateWebhookEndpoint,
} = await import('./webhook-actions');

const OWNER = { id: 'owner-1', is_anonymous: false, email: 'owner@example.com' };
const GUEST = { id: 'guest-1', is_anonymous: true, email: null };
const VALID_FIELDS = {
    name: 'Zapier',
    url: 'https://hooks.example.com/catch/1',
    event_types: ['task.created'],
    payload_level: 'standard',
};

/** A chainable stand-in for a Supabase query: every method returns itself and it resolves to `actionResult`. */
function buildQuery(queryResult, onUpdate) {
    const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        delete: vi.fn(() => query),
        update: vi.fn((changes) => {
            onUpdate?.(changes);
            return query;
        }),
        maybeSingle: () => Promise.resolve(queryResult),
        single: () => Promise.resolve(queryResult),
        then: (resolve, reject) => Promise.resolve(queryResult).then(resolve, reject),
    };
    return query;
}

let sessionQueries;
let adminQueries;
let adminRpc;
let adminUpdates;

/**
 * Wires the mocked session client (what RLS lets the caller see) and admin client (service writes).
 *
 * @param {{ endpoint?: object|null, delivery?: object|null, rpcResult?: object }} scenario - What the database returns.
 */
function setUpDatabase({
    endpoint = null,
    delivery = null,
    rpcResult = { data: 'new-id', error: null },
} = {}) {
    adminUpdates = [];
    sessionQueries = {
        webhook_endpoints: buildQuery({ data: endpoint, error: null }),
        webhook_deliveries: buildQuery({ data: delivery, error: null }),
    };
    adminQueries = {
        webhook_endpoints: buildQuery({ data: { id: 'endpoint-1' }, error: null }, (changes) =>
            adminUpdates.push(changes),
        ),
    };
    adminRpc = vi.fn().mockResolvedValue(rpcResult);
    mocks.createSessionClient.mockResolvedValue({ from: (table) => sessionQueries[table] });
    mocks.createAdminClient.mockReturnValue({
        from: (table) => adminQueries[table],
        rpc: adminRpc,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(OWNER);
    mocks.resolveSpacePermission.mockResolvedValue('owner');
    mocks.resolvePublicAddresses.mockResolvedValue({ isPublic: true, addresses: [] });
    setUpDatabase();
});

describe('authentication and guests', () => {
    it('refuses every action when not logged in, without touching the database', async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        for (const actionResult of [
            await listWebhookEndpoints('space-1'),
            await createWebhookEndpoint('space-1', VALID_FIELDS),
            await updateWebhookEndpoint('endpoint-1', { name: 'x' }),
            await setWebhookEndpointEnabled('endpoint-1', true),
            await rotateWebhookSecret('endpoint-1'),
            await deleteWebhookEndpoint('endpoint-1'),
            await sendWebhookTestEvent('endpoint-1'),
            await listWebhookDeliveries('endpoint-1'),
            await retryWebhookDelivery('delivery-1'),
        ])
            expect(actionResult.code).toBe('NOT_AUTHENTICATED');
        expect(mocks.createAdminClient).not.toHaveBeenCalled();
    });

    it('blocks guests from every action', async () => {
        mocks.getCurrentUser.mockResolvedValue(GUEST);
        const guestResults = [
            await listWebhookEndpoints('space-1'),
            await createWebhookEndpoint('space-1', VALID_FIELDS),
            await rotateWebhookSecret('endpoint-1'),
            await sendWebhookTestEvent('endpoint-1'),
            await retryWebhookDelivery('delivery-1'),
        ];
        for (const actionResult of guestResults) expect(actionResult.code).toBeTruthy();
        expect(new Set(guestResults.map((actionResult) => actionResult.code)).size).toBe(1);
        expect(guestResults[0].code).not.toBe('NOT_AUTHENTICATED');
        expect(mocks.createAdminClient).not.toHaveBeenCalled();
    });
});

describe('createWebhookEndpoint', () => {
    it('refuses a collaborator and never creates anything', async () => {
        mocks.resolveSpacePermission.mockResolvedValue('full');
        const actionResult = await createWebhookEndpoint('space-1', VALID_FIELDS);
        expect(actionResult).toMatchObject({ data: null, code: 'WEBHOOK_OWNER_ONLY' });
        expect(adminRpc).not.toHaveBeenCalled();
    });

    it('rejects bad input before any permission or network work', async () => {
        const actionResult = await createWebhookEndpoint('space-1', {
            ...VALID_FIELDS,
            url: 'http://x.example.com',
        });
        expect(actionResult).toMatchObject({ data: null, code: 'WEBHOOK_URL_NOT_HTTPS' });
        expect(mocks.resolveSpacePermission).not.toHaveBeenCalled();
        expect(mocks.resolvePublicAddresses).not.toHaveBeenCalled();
    });

    it('refuses a host that resolves to a non-public address', async () => {
        mocks.resolvePublicAddresses.mockResolvedValue({
            isPublic: false,
            code: 'WEBHOOK_URL_BLOCKED',
        });
        const actionResult = await createWebhookEndpoint('space-1', VALID_FIELDS);
        expect(actionResult).toMatchObject({ data: null, code: 'WEBHOOK_URL_BLOCKED' });
        expect(adminRpc).not.toHaveBeenCalled();
    });

    it('creates the endpoint with a fresh secret, the caller as creator, and returns the secret only in data.secret', async () => {
        setUpDatabase({
            endpoint: { id: 'endpoint-1', name: 'Zapier' },
            rpcResult: { data: 'endpoint-1', error: null },
        });
        const actionResult = await createWebhookEndpoint('space-1', {
            ...VALID_FIELDS,
            space_id: 'evil',
            enabled: false,
        });

        expect(actionResult.error).toBeNull();
        expect(actionResult.data.secret).toMatch(/^whsec_/);
        expect(JSON.stringify(actionResult.data.endpoint)).not.toContain('whsec_');
        const [functionName, rpcArguments] = adminRpc.mock.calls[0];
        expect(functionName).toBe('create_webhook_endpoint');
        expect(rpcArguments).toMatchObject({
            p_space_id: 'space-1',
            p_created_by: 'owner-1',
            p_secret: actionResult.data.secret,
            p_event_types: ['task.created'],
        });
    });

    it('reads the endpoint back with an explicit column list, never a star', async () => {
        setUpDatabase({
            endpoint: { id: 'endpoint-1' },
            rpcResult: { data: 'endpoint-1', error: null },
        });
        await createWebhookEndpoint('space-1', VALID_FIELDS);
        const selectedColumns = sessionQueries.webhook_endpoints.select.mock.calls[0][0];
        expect(selectedColumns).not.toContain('*');
        expect(selectedColumns).not.toContain('secret_id');
    });

    it('maps the endpoint limit and duplicate URL to stable codes', async () => {
        setUpDatabase({ rpcResult: { data: null, error: { message: 'WEBHOOK_ENDPOINT_LIMIT' } } });
        expect((await createWebhookEndpoint('space-1', VALID_FIELDS)).code).toBe(
            'WEBHOOK_ENDPOINT_LIMIT',
        );
        setUpDatabase({
            rpcResult: { data: null, error: { code: '23505', message: 'duplicate key' } },
        });
        expect((await createWebhookEndpoint('space-1', VALID_FIELDS)).code).toBe(
            'WEBHOOK_URL_DUPLICATE',
        );
    });

    it('hides unexpected database errors from the caller and logs them', async () => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        setUpDatabase({
            rpcResult: { data: null, error: { message: 'permission denied for vault.secrets' } },
        });
        const actionResult = await createWebhookEndpoint('space-1', VALID_FIELDS);
        expect(actionResult).toEqual({
            data: null,
            error: 'Failed to create webhook',
            code: 'WEBHOOK_ACTION_FAILED',
        });
        expect(errorLog).toHaveBeenCalled();
        errorLog.mockRestore();
    });

    it('returns a generic error instead of throwing when something unexpected throws', async () => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        adminRpc.mockRejectedValue(new Error('network down: postgres://secret-host'));
        const actionResult = await createWebhookEndpoint('space-1', VALID_FIELDS);
        expect(actionResult).toEqual({ data: null, error: 'Unexpected error creating webhook' });
        errorLog.mockRestore();
    });
});

describe('listWebhookEndpoints', () => {
    it('refuses a collaborator', async () => {
        mocks.resolveSpacePermission.mockResolvedValue('read_only');
        expect(await listWebhookEndpoints('space-1')).toMatchObject({
            data: null,
            code: 'WEBHOOK_OWNER_ONLY',
        });
    });

    it('lists with an explicit column list that excludes secret ids', async () => {
        setUpDatabase();
        sessionQueries.webhook_endpoints = buildQuery({
            data: [{ id: 'endpoint-1' }],
            error: null,
        });
        const actionResult = await listWebhookEndpoints('space-1');
        expect(actionResult).toEqual({ data: [{ id: 'endpoint-1' }], error: null });
        const selectedColumns = sessionQueries.webhook_endpoints.select.mock.calls[0][0];
        expect(selectedColumns).not.toContain('*');
        expect(selectedColumns).not.toContain('secret_id');
    });
});

describe('endpoint-scoped actions when the endpoint is not visible to the caller', () => {
    it.each([
        ['update', () => updateWebhookEndpoint('endpoint-1', { name: 'x' })],
        ['enable', () => setWebhookEndpointEnabled('endpoint-1', true)],
        ['rotate', () => rotateWebhookSecret('endpoint-1')],
        ['delete', () => deleteWebhookEndpoint('endpoint-1')],
        ['test event', () => sendWebhookTestEvent('endpoint-1')],
        ['delivery log', () => listWebhookDeliveries('endpoint-1')],
    ])('%s answers not-found and never uses the admin client', async (_label, runAction) => {
        setUpDatabase({ endpoint: null });
        expect(await runAction()).toMatchObject({ code: 'WEBHOOK_ENDPOINT_NOT_FOUND' });
        expect(adminRpc).not.toHaveBeenCalled();
        expect(adminUpdates).toEqual([]);
    });

    it('treats a missing id the same way', async () => {
        expect(await rotateWebhookSecret(undefined)).toMatchObject({
            code: 'WEBHOOK_ENDPOINT_NOT_FOUND',
        });
    });
});

describe('updateWebhookEndpoint', () => {
    it('writes only allowlisted fields, whatever the client sends', async () => {
        setUpDatabase({ endpoint: { id: 'endpoint-1', space_id: 'space-1', enabled: true } });
        await updateWebhookEndpoint('endpoint-1', {
            name: 'Renamed',
            payload_level: 'full',
            space_id: 'other-space',
            secret_id: 'stolen',
            enabled: false,
            consecutive_failures: 0,
        });
        expect(adminUpdates).toEqual([{ name: 'Renamed', payload_level: 'full' }]);
    });

    it('checks the new URL host before saving it', async () => {
        setUpDatabase({ endpoint: { id: 'endpoint-1', space_id: 'space-1', enabled: true } });
        mocks.resolvePublicAddresses.mockResolvedValue({
            isPublic: false,
            code: 'WEBHOOK_URL_BLOCKED',
        });
        const actionResult = await updateWebhookEndpoint('endpoint-1', {
            url: 'https://rebind.example.com/x',
        });
        expect(actionResult.code).toBe('WEBHOOK_URL_BLOCKED');
        expect(adminUpdates).toEqual([]);
    });

    it('rejects an update with nothing recognised in it', async () => {
        setUpDatabase({ endpoint: { id: 'endpoint-1', space_id: 'space-1', enabled: true } });
        expect((await updateWebhookEndpoint('endpoint-1', { secret_id: 'x' })).code).toBe(
            'WEBHOOK_INPUT_INVALID',
        );
        expect(adminUpdates).toEqual([]);
    });
});

describe('setWebhookEndpointEnabled', () => {
    beforeEach(() =>
        setUpDatabase({ endpoint: { id: 'endpoint-1', space_id: 'space-1', enabled: false } }),
    );

    it('turning on clears the reason and the failure counter', async () => {
        await setWebhookEndpointEnabled('endpoint-1', true);
        expect(adminUpdates).toEqual([
            { enabled: true, disabled_reason: null, consecutive_failures: 0 },
        ]);
    });

    it('turning off records a manual reason', async () => {
        await setWebhookEndpointEnabled('endpoint-1', false);
        expect(adminUpdates).toEqual([{ enabled: false, disabled_reason: 'manual' }]);
    });

    it('rejects a value that is not a boolean', async () => {
        expect((await setWebhookEndpointEnabled('endpoint-1', 'yes')).code).toBe(
            'WEBHOOK_INPUT_INVALID',
        );
        expect(adminUpdates).toEqual([]);
    });
});

describe('rotateWebhookSecret', () => {
    it('returns the new secret once and passes the same value to the database', async () => {
        setUpDatabase({
            endpoint: { id: 'endpoint-1', space_id: 'space-1', enabled: true },
            rpcResult: { data: null, error: null },
        });
        const actionResult = await rotateWebhookSecret('endpoint-1');
        expect(actionResult.data.secret).toMatch(/^whsec_/);
        expect(adminRpc).toHaveBeenCalledWith('rotate_webhook_endpoint_secret', {
            p_endpoint_id: 'endpoint-1',
            p_new_secret: actionResult.data.secret,
        });
    });
});

describe('sendWebhookTestEvent', () => {
    it('takes the space from the loaded endpoint, never from the client', async () => {
        setUpDatabase({
            endpoint: { id: 'endpoint-1', space_id: 'space-from-db', enabled: true },
            rpcResult: { data: 'event-1', error: null },
        });
        const actionResult = await sendWebhookTestEvent('endpoint-1');
        expect(actionResult).toEqual({ data: { eventId: 'event-1' }, error: null });
        expect(adminRpc).toHaveBeenCalledWith('create_webhook_test_delivery', {
            p_endpoint_id: 'endpoint-1',
            p_space_id: 'space-from-db',
        });
    });

    it('reports the rate limit and a disabled endpoint with their own codes', async () => {
        const endpoint = { id: 'endpoint-1', space_id: 'space-1', enabled: true };
        setUpDatabase({
            endpoint,
            rpcResult: { data: null, error: { message: 'WEBHOOK_TEST_RATE_LIMITED' } },
        });
        expect((await sendWebhookTestEvent('endpoint-1')).code).toBe('WEBHOOK_TEST_RATE_LIMITED');
        setUpDatabase({
            endpoint,
            rpcResult: { data: null, error: { message: 'WEBHOOK_ENDPOINT_DISABLED' } },
        });
        expect((await sendWebhookTestEvent('endpoint-1')).code).toBe('WEBHOOK_ENDPOINT_DISABLED');
    });
});

describe('listWebhookDeliveries', () => {
    it('reads a bounded, newest-first log', async () => {
        setUpDatabase({ endpoint: { id: 'endpoint-1', space_id: 'space-1', enabled: true } });
        sessionQueries.webhook_deliveries = buildQuery({
            data: [{ id: 'delivery-1' }],
            error: null,
        });
        const actionResult = await listWebhookDeliveries('endpoint-1');
        expect(actionResult).toEqual({ data: [{ id: 'delivery-1' }], error: null });
        expect(sessionQueries.webhook_deliveries.limit).toHaveBeenCalledWith(50);
    });
});

describe('retryWebhookDelivery', () => {
    it('answers not-found when the delivery is not visible to the caller', async () => {
        setUpDatabase({ delivery: null });
        expect(await retryWebhookDelivery('delivery-1')).toMatchObject({
            code: 'WEBHOOK_DELIVERY_NOT_FOUND',
        });
        expect(adminRpc).not.toHaveBeenCalled();
    });

    it('takes the space from the loaded delivery and maps refusals to stable codes', async () => {
        setUpDatabase({
            delivery: { id: 'delivery-1', space_id: 'space-from-db' },
            rpcResult: { data: null, error: { message: 'WEBHOOK_RETRY_TOO_SOON' } },
        });
        expect(await retryWebhookDelivery('delivery-1')).toMatchObject({
            code: 'WEBHOOK_RETRY_TOO_SOON',
        });
        expect(adminRpc).toHaveBeenCalledWith('retry_webhook_delivery', {
            p_delivery_id: 'delivery-1',
            p_space_id: 'space-from-db',
        });
    });

    it('succeeds with a bare error-null actionResult', async () => {
        setUpDatabase({
            delivery: { id: 'delivery-1', space_id: 'space-1' },
            rpcResult: { data: null, error: null },
        });
        expect(await retryWebhookDelivery('delivery-1')).toEqual({ error: null });
    });
});
