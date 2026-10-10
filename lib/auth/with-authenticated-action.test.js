import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
const blockGuestAction = vi.fn();
const createClient = vi.fn();

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/lib/guest/guest-guards', () => ({
    blockGuestAction: (...args) => blockGuestAction(...args),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }));

import { withAuthenticatedAction } from './with-authenticated-action';

describe('withAuthenticatedAction', () => {
    beforeEach(() => {
        getCurrentUser.mockResolvedValue({ id: 'user-1' });
        blockGuestAction.mockReturnValue(null);
        createClient.mockResolvedValue({ marker: 'supabase' });
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it('hands the handler the user, the client and the caller arguments, and returns its result', async () => {
        const handler = vi.fn().mockResolvedValue({ data: { id: 't1' }, error: null });
        const action = withAuthenticatedAction('[tasks] test', 'Unexpected', handler);

        const actionResult = await action('task-1', { title: 'x' });

        expect(handler).toHaveBeenCalledWith({ id: 'user-1' }, { marker: 'supabase' }, 'task-1', {
            title: 'x',
        });
        expect(actionResult).toEqual({ data: { id: 't1' }, error: null });
    });

    it('refuses a signed-out caller with the stable code, without running the handler', async () => {
        getCurrentUser.mockResolvedValue(null);
        const handler = vi.fn();
        const action = withAuthenticatedAction('[tasks] test', 'Unexpected', handler);

        expect(await action()).toEqual({
            data: null,
            error: 'You must be logged in',
            code: 'NOT_AUTHENTICATED',
        });
        expect(handler).not.toHaveBeenCalled();
        expect(createClient).not.toHaveBeenCalled();
    });

    it('leaves out the data key for actions that return none', async () => {
        getCurrentUser.mockResolvedValue(null);
        const action = withAuthenticatedAction('[tasks] test', 'Unexpected', vi.fn(), {
            hasData: false,
        });

        expect(await action()).toEqual({
            error: 'You must be logged in',
            code: 'NOT_AUTHENTICATED',
        });
    });

    it('refuses a guest only when the action asks for it', async () => {
        const guestRefusal = { error: 'Not in guest mode', code: 'GUEST_ACTION_NOT_ALLOWED' };
        blockGuestAction.mockReturnValue(guestRefusal);
        const handler = vi.fn().mockResolvedValue({ data: null, error: null });
        const guardedAction = withAuthenticatedAction('[x] a', 'Unexpected', handler, {
            blockGuest: true,
        });
        const openAction = withAuthenticatedAction('[x] b', 'Unexpected', handler);

        expect(await guardedAction()).toEqual({ data: null, ...guestRefusal });
        expect(handler).not.toHaveBeenCalled();

        await openAction();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('returns the generic message and logs the detail and id arguments when the handler throws', async () => {
        const action = withAuthenticatedAction(
            '[tasks] update',
            'Unexpected error updating task',
            () => {
                throw new Error('relation "tasks" does not exist');
            },
        );

        const actionResult = await action('task-1', { title: 'secret title' });

        expect(actionResult).toEqual({ data: null, error: 'Unexpected error updating task' });
        expect(console.error).toHaveBeenCalledWith('[tasks] update threw', {
            ids: ['task-1'],
            detail: 'relation "tasks" does not exist',
        });
        expect(JSON.stringify(console.error.mock.calls)).not.toContain('secret title');
    });

    it('catches a failure creating the client too, and drops the data key when told', async () => {
        createClient.mockRejectedValue(new Error('cookies unavailable'));
        const action = withAuthenticatedAction('[tasks] delete', 'Unexpected', vi.fn(), {
            hasData: false,
        });

        expect(await action('task-1')).toEqual({ error: 'Unexpected' });
    });
});
