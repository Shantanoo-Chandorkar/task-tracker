import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';

const OWNER_ID = 'user-owner';
const STRANGER_ID = 'user-stranger';
const CLIENT_ID = '3f2b1c4e-5d6a-4b7c-8d9e-0a1b2c3d4e5f';

const VALID_BLOCKS = [
    { kind: 'work', label: 'Focus', durationSeconds: 1500 },
    { kind: 'break', label: 'Break', durationSeconds: 300 },
];

let fake;
let tables;
let currentUserId;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => currentUserId && { id: currentUserId },
}));

/**
 * @param {string} id
 * @param {object} [overrides]
 */
function buildTemplateRow(id, overrides = {}) {
    return {
        id,
        user_id: OWNER_ID,
        name: 'Pomodoro',
        blocks: VALID_BLOCKS,
        ...overrides,
    };
}

function setUpWorld({ templates, fakeOptions } = {}) {
    tables = { timer_templates: templates ?? [] };
    fake = createFakeSupabase({ tables, getCallerId: () => currentUserId, ...fakeOptions });
}

async function timerTemplateActions() {
    return import('./timer-template-actions');
}

beforeEach(() => {
    currentUserId = OWNER_ID;
    setUpWorld();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('createTimerTemplate', () => {
    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;
        const { createTimerTemplate } = await timerTemplateActions();

        expect(await createTimerTemplate({ name: 'Pomodoro', blocks: VALID_BLOCKS })).toMatchObject(
            { data: null, code: 'NOT_AUTHENTICATED' },
        );
    });

    it('creates a template with a normalized name and blocks', async () => {
        const { createTimerTemplate } = await timerTemplateActions();

        const createResult = await createTimerTemplate({
            name: '  Pomodoro  ',
            blocks: VALID_BLOCKS,
        });

        expect(createResult.error).toBeNull();
        expect(createResult.data).toMatchObject({
            name: 'Pomodoro',
            blocks: VALID_BLOCKS,
            user_id: OWNER_ID,
        });
    });

    it('rejects an empty name', async () => {
        const { createTimerTemplate } = await timerTemplateActions();

        expect(await createTimerTemplate({ name: '  ', blocks: VALID_BLOCKS })).toMatchObject({
            data: null,
            code: 'TIMER_TEMPLATE_NAME_REQUIRED',
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it('rejects an invalid block list', async () => {
        const { createTimerTemplate } = await timerTemplateActions();

        expect(await createTimerTemplate({ name: 'Pomodoro', blocks: [] })).toMatchObject({
            data: null,
            code: 'TIMER_TEMPLATE_BLOCKS_INVALID',
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it('returns the first row on a client-id retry instead of creating a second one', async () => {
        setUpWorld({ templates: [buildTemplateRow(CLIENT_ID)] });
        const { createTimerTemplate } = await timerTemplateActions();

        const createResult = await createTimerTemplate({
            id: CLIENT_ID,
            name: 'Pomodoro',
            blocks: VALID_BLOCKS,
        });

        expect(createResult.data.id).toBe(CLIENT_ID);
        expect(fake.inserts).toHaveLength(0);
    });

    it('turns a guest limit error into the friendly guest result', async () => {
        setUpWorld({
            fakeOptions: {
                insertError: { code: 'P0001', message: 'GUEST_LIMIT_REACHED:timer_templates' },
            },
        });
        const { createTimerTemplate } = await timerTemplateActions();

        const createResult = await createTimerTemplate({ name: 'Pomodoro', blocks: VALID_BLOCKS });

        expect(createResult.data).toBeNull();
        expect(createResult.error).toContain('Guest mode is limited to 10 timer templates');
    });

    it('turns a rate limit error into the friendly rate-limit result', async () => {
        setUpWorld({
            fakeOptions: { insertError: { message: 'TIMER_TEMPLATE_WRITE_RATE_LIMITED:minute' } },
        });
        const { createTimerTemplate } = await timerTemplateActions();

        expect(await createTimerTemplate({ name: 'Pomodoro', blocks: VALID_BLOCKS })).toMatchObject(
            { data: null, code: 'TIMER_TEMPLATE_RATE_LIMITED' },
        );
    });

    it('hides a database failure behind a fixed message', async () => {
        setUpWorld({ fakeOptions: { insertError: { code: 'XX000', message: 'boom' } } });
        const { createTimerTemplate } = await timerTemplateActions();

        expect(await createTimerTemplate({ name: 'Pomodoro', blocks: VALID_BLOCKS })).toEqual({
            data: null,
            error: 'Failed to create template',
        });
    });
});

describe('updateTimerTemplate', () => {
    it('needs a template id', async () => {
        const { updateTimerTemplate } = await timerTemplateActions();

        expect(await updateTimerTemplate(undefined, {})).toMatchObject({
            data: null,
            code: 'TIMER_TEMPLATE_ID_REQUIRED',
        });
    });

    it('refuses an unknown template', async () => {
        const { updateTimerTemplate } = await timerTemplateActions();

        expect(await updateTimerTemplate('template-missing', { name: 'New name' })).toMatchObject({
            data: null,
            code: 'TIMER_TEMPLATE_NOT_FOUND',
        });
    });

    it('updates only the fields sent', async () => {
        setUpWorld({ templates: [buildTemplateRow('template-1')] });
        const { updateTimerTemplate } = await timerTemplateActions();

        const updateResult = await updateTimerTemplate('template-1', { name: 'Renamed' });

        expect(updateResult.data).toMatchObject({ name: 'Renamed', blocks: VALID_BLOCKS });
    });

    it('rejects an invalid block list on update', async () => {
        setUpWorld({ templates: [buildTemplateRow('template-1')] });
        const { updateTimerTemplate } = await timerTemplateActions();

        expect(await updateTimerTemplate('template-1', { blocks: 'nope' })).toMatchObject({
            data: null,
            code: 'TIMER_TEMPLATE_BLOCKS_INVALID',
        });
    });
});

describe('deleteTimerTemplate', () => {
    it('needs a template id', async () => {
        const { deleteTimerTemplate } = await timerTemplateActions();

        expect(await deleteTimerTemplate()).toMatchObject({ code: 'TIMER_TEMPLATE_ID_REQUIRED' });
    });

    it('refuses deleting a template that is not the caller’s own', async () => {
        setUpWorld({ templates: [buildTemplateRow('template-1', { user_id: STRANGER_ID })] });
        const { deleteTimerTemplate } = await timerTemplateActions();

        expect(await deleteTimerTemplate('template-1')).toMatchObject({
            code: 'TIMER_TEMPLATE_NOT_FOUND',
        });
        expect(tables.timer_templates).toHaveLength(1);
    });

    it('deletes the caller’s own template', async () => {
        setUpWorld({ templates: [buildTemplateRow('template-1')] });
        const { deleteTimerTemplate } = await timerTemplateActions();

        expect(await deleteTimerTemplate('template-1')).toEqual({ error: null });
        expect(tables.timer_templates).toHaveLength(0);
    });
});

describe('duplicateTimerTemplate', () => {
    it('needs a source template id', async () => {
        const { duplicateTimerTemplate } = await timerTemplateActions();

        expect(await duplicateTimerTemplate()).toMatchObject({
            data: null,
            code: 'TIMER_TEMPLATE_ID_REQUIRED',
        });
    });

    it('refuses duplicating a template that is not the caller’s own', async () => {
        setUpWorld({ templates: [buildTemplateRow('template-1', { user_id: STRANGER_ID })] });
        const { duplicateTimerTemplate } = await timerTemplateActions();

        expect(await duplicateTimerTemplate('template-1')).toMatchObject({
            data: null,
            code: 'TIMER_TEMPLATE_NOT_FOUND',
        });
    });

    it('copies the source template under a "(copy)" name', async () => {
        setUpWorld({ templates: [buildTemplateRow('template-1', { name: 'Pomodoro' })] });
        const { duplicateTimerTemplate } = await timerTemplateActions();

        const duplicateResult = await duplicateTimerTemplate('template-1');

        expect(duplicateResult.data).toMatchObject({
            name: 'Pomodoro (copy)',
            blocks: VALID_BLOCKS,
            user_id: OWNER_ID,
        });
        expect(tables.timer_templates).toHaveLength(2);
    });

    it('returns the first copy on a client-id retry instead of creating a second one', async () => {
        setUpWorld({
            templates: [buildTemplateRow('template-1'), buildTemplateRow(CLIENT_ID)],
        });
        const { duplicateTimerTemplate } = await timerTemplateActions();

        const duplicateResult = await duplicateTimerTemplate('template-1', CLIENT_ID);

        expect(duplicateResult.data.id).toBe(CLIENT_ID);
        expect(tables.timer_templates).toHaveLength(2);
    });
});
