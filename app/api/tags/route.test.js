import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), tagQuery: null }));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ from: (tableName) => mocks.tagQuery.start(tableName) }),
}));

const { GET } = await import('./route');

/** Records how the route asked for the tags, and answers with the given result when awaited. */
function buildTagQuery(queryResult) {
    const calls = { orderedBy: [], filters: [] };
    const query = {
        calls,
        start(tableName) {
            calls.tableName = tableName;
            return query;
        },
        select(columns) {
            calls.columns = columns;
            return query;
        },
        eq(column, value) {
            calls.filters.push([column, value]);
            return query;
        },
        order(column, options) {
            calls.orderedBy.push([column, options]);
            return query;
        },
        then: (resolve) => resolve(queryResult),
    };
    return query;
}

function requestFor(search) {
    return { nextUrl: new URL(`http://localhost/api/tags${search}`) };
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: 'user-1' });
});

describe('GET /api/tags', () => {
    it('refuses a signed-out caller', async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        mocks.tagQuery = buildTagQuery({ data: [], error: null });

        expect((await GET(requestFor('?space_id=space-1'))).status).toBe(401);
    });

    it('needs a space id', async () => {
        mocks.tagQuery = buildTagQuery({ data: [], error: null });

        const response = await GET(requestFor(''));

        expect(response.status).toBe(400);
        expect((await response.json()).code).toBe('TAG_SPACE_ID_REQUIRED');
    });

    it('returns the tags of that space with colour and position, in saved order then name', async () => {
        const tags = [{ id: 't1', name: 'Urgent', color: '#ff0000', position: 0 }];
        mocks.tagQuery = buildTagQuery({ data: tags, error: null });

        const response = await GET(requestFor('?space_id=space-1'));

        expect(await response.json()).toEqual(tags);
        expect(mocks.tagQuery.calls).toMatchObject({
            tableName: 'tags',
            columns: 'id, name, color, position',
            filters: [['space_id', 'space-1']],
            orderedBy: [
                ['position', { ascending: true }],
                ['name', { ascending: true }],
            ],
        });
    });

    it('hides a database failure behind a fixed message and code', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.tagQuery = buildTagQuery({ data: null, error: { code: 'XX000', message: 'boom' } });

        const response = await GET(requestFor('?space_id=space-1'));

        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('boom');
    });
});
