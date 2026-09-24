import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    createSessionClient: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createSessionClient }));

const { createSpace } = await import('./space-actions');
const { createList } = await import('./list-actions');
const { createSublist } = await import('./sublist-actions');
const { createStatus } = await import('./status-actions');
const { createTask } = await import('./task-actions');
const { GUEST_ERROR_CODES } = await import('@/lib/guest/guest-error-codes');

/**
 * Fake Supabase client: reads (used to work out the next position) return no rows, and the insert fails with
 * the given database error.
 *
 * @param {{ message: string, code?: string }} insertError - Error the insert returns.
 * @returns {object} Client with a chainable `from`.
 */
function makeClientWhoseInsertFails(insertError) {
    const readChain = {
        select: () => readChain,
        order: () => readChain,
        limit: () => readChain,
        eq: () => readChain,
        is: () => readChain,
        single: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve) => resolve({ data: [], error: null }),
    };
    const insertChain = {
        select: () => insertChain,
        single: async () => ({ data: null, error: insertError }),
    };
    return { from: () => ({ ...readChain, insert: () => insertChain }) };
}

const createCases = [
    ['createSpace', () => createSpace({ name: 'Space' })],
    ['createList', () => createList({ name: 'List', space_id: 'space-1' })],
    ['createSublist', () => createSublist({ name: 'Sublist', list_id: 'list-1' })],
    ['createStatus', () => createStatus({ name: 'Status', space_id: 'space-1' })],
    ['createTask', () => createTask({ title: 'Task', list_id: 'list-1' })],
];

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getCurrentUser.mockResolvedValue({ id: 'guest-1', is_anonymous: true });
});

describe('a guest-limit error from the database', () => {
    beforeEach(() => {
        mocks.createSessionClient.mockResolvedValue(
            makeClientWhoseInsertFails({ message: 'GUEST_LIMIT_REACHED:tasks', code: 'P0001' }),
        );
    });

    it.each(createCases)(
        '%s returns the friendly limit code instead of a generic failure',
        async (name, callAction) => {
            const actionResult = await callAction();
            expect(actionResult.code).toBe(GUEST_ERROR_CODES.LIMIT_REACHED);
            expect(actionResult.data).toBeNull();
            expect(actionResult.error).toMatch(/Guest mode/);
        },
    );

    it.each(createCases)('%s does not leak the raw database message', async (name, callAction) => {
        const actionResult = await callAction();
        expect(actionResult.error).not.toContain('GUEST_LIMIT_REACHED');
        expect(JSON.stringify(actionResult)).not.toContain('GUEST_LIMIT_REACHED:');
        expect(JSON.stringify(actionResult)).not.toContain('P0001');
    });
});

describe('any other database error keeps the old generic message', () => {
    beforeEach(() => {
        mocks.createSessionClient.mockResolvedValue(
            makeClientWhoseInsertFails({
                message: 'permission denied for table tasks',
                code: '42501',
            }),
        );
    });

    it.each(createCases)(
        '%s still says it failed, with no guest code',
        async (name, callAction) => {
            const actionResult = await callAction();
            expect(actionResult.error).toMatch(/Failed to create/);
            expect(actionResult.code).toBeUndefined();
        },
    );
});
