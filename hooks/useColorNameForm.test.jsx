import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useColorNameForm } from './useColorNameForm';

vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
// Counts up so each "new id" is visibly different; `unavailable` mimics a browser without crypto.randomUUID
const clientIds = vi.hoisted(() => ({ counter: 0, unavailable: false }));
vi.mock('@/lib/client-id', () => ({
    createClientId: () => (clientIds.unavailable ? undefined : `client-id-${++clientIds.counter}`),
}));

const createSubmitEvent = () => ({ preventDefault: vi.fn() });

/**
 * Renders the hook in create mode with a name already typed, and a refetch the test can release by hand.
 *
 * @param {{ create: Function }} actions - Mocked create action the form calls on submit.
 * @returns {object} The hook under test (`formHook`) plus `onClose` and `releaseRefetch`.
 */
function renderCreateForm({ create }) {
    const queryClient = new QueryClient();
    let releaseRefetch;
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(
        () => new Promise((resolve) => (releaseRefetch = resolve)),
    );
    const onClose = vi.fn();
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const renderedForm = renderHook(
        () =>
            useColorNameForm({
                open: true,
                entity: null,
                create,
                update: vi.fn(),
                invalidateQueryKey: ['spaces'],
                onClose,
            }),
        { wrapper },
    );
    act(() => renderedForm.result.current.setName('Groceries'));
    return { formHook: renderedForm.result, onClose, releaseRefetch: () => releaseRefetch() };
}

describe('useColorNameForm', () => {
    it('ignores a second submit while the first is saving, and creates nothing extra', async () => {
        const create = vi.fn().mockResolvedValue({ error: null });
        const { formHook, onClose, releaseRefetch } = renderCreateForm({ create });

        let firstSubmit;
        await act(async () => {
            firstSubmit = formHook.current.handleSubmit(createSubmitEvent());
        });
        expect(formHook.current.submitting).toBe(true);

        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });
        expect(create).toHaveBeenCalledTimes(1);

        await act(async () => {
            await firstSubmit;
        });
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledTimes(1);
        releaseRefetch();
    });

    it('closes as soon as the server confirms, without waiting for the refetch', async () => {
        const create = vi.fn().mockResolvedValue({ error: null });
        const { formHook, onClose, releaseRefetch } = renderCreateForm({ create });

        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });

        expect(onClose).toHaveBeenCalledTimes(1);
        releaseRefetch();
    });

    it('unlocks and shows the server error when the create is rejected', async () => {
        const create = vi.fn().mockResolvedValue({ error: 'Name taken' });
        const { formHook, onClose } = renderCreateForm({ create });

        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });

        expect(formHook.current.submitting).toBe(false);
        expect(formHook.current.error).toBe('Name taken');
        expect(onClose).not.toHaveBeenCalled();
    });

    it('unlocks with a connection message when the action itself throws', async () => {
        const create = vi.fn().mockRejectedValue(new Error('network down'));
        const { formHook } = renderCreateForm({ create });

        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });

        expect(formHook.current.submitting).toBe(false);
        expect(formHook.current.error).toContain('Could not reach the server');
    });
});

/**
 * Renders the hook the way a parent drives it, closing the dialog and nulling the entity as the parent does.
 *
 * @param {{ create: Function, update: Function, initialEntity: object|null }} options - Mocked actions and the entity.
 * @returns {object} The hook under test (`formHook`) plus `onClose`, `closeLikeParent` and `reopenLikeParent`.
 */
function renderParentDrivenForm({ create, update, initialEntity }) {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const onClose = vi.fn();
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const renderedForm = renderHook(
        ({ open, entity }) =>
            useColorNameForm({
                open,
                entity,
                create,
                update,
                invalidateQueryKey: ['lists'],
                onClose,
            }),
        { wrapper, initialProps: { open: false, entity: null } },
    );
    // Dialogs mount closed and are opened by the parent, which is when the form resets.
    renderedForm.rerender({ open: true, entity: initialEntity });
    return {
        formHook: renderedForm.result,
        onClose,
        closeLikeParent: () => renderedForm.rerender({ open: false, entity: null }),
        reopenLikeParent: (entity = null) => renderedForm.rerender({ open: true, entity }),
    };
}

/**
 * Renders the hook against a query client holding cached rows, so cache updates can be asserted.
 *
 * @param {object} options
 * @param {object[]} options.cachedRows - Rows already cached under ['lists'].
 * @param {object} options.actions - `create` and `update` mocks.
 * @param {object|null} options.entity - Entity being edited, or null for create mode.
 * @param {object} [options.createdRowDefaults] - Passed through to the hook.
 * @returns {object} The hook (`formHook`) and the `queryClient`.
 */
function renderFormWithCachedRows({ cachedRows, actions, entity, createdRowDefaults }) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['lists'], cachedRows);
    vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(new Promise(() => {}));
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const renderedForm = renderHook(
        ({ open }) =>
            useColorNameForm({
                open,
                entity,
                ...actions,
                invalidateQueryKey: ['lists'],
                createdRowDefaults,
                onClose: vi.fn(),
            }),
        { wrapper, initialProps: { open: false } },
    );
    renderedForm.rerender({ open: true });
    return { formHook: renderedForm.result, queryClient };
}

describe('useColorNameForm cache update from the action result', () => {
    const cachedLists = [
        { id: 'list-1', name: 'Old', task_count: 4 },
        { id: 'list-2', name: 'Other', task_count: 1 },
    ];

    it('merges the saved row over the cached one on edit, keeping fields the action does not return', async () => {
        const update = vi
            .fn()
            .mockResolvedValue({ data: { id: 'list-1', name: 'New' }, error: null });
        const { formHook, queryClient } = renderFormWithCachedRows({
            cachedRows: cachedLists,
            actions: { create: vi.fn(), update },
            entity: { id: 'list-1', name: 'Old', color: '#112233' },
        });

        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });

        expect(queryClient.getQueryData(['lists'])).toEqual([
            { id: 'list-1', name: 'New', task_count: 4 },
            { id: 'list-2', name: 'Other', task_count: 1 },
        ]);
    });

    it('appends the created row with the given defaults', async () => {
        const create = vi
            .fn()
            .mockResolvedValue({ data: { id: 'list-3', name: 'Fresh' }, error: null });
        const { formHook, queryClient } = renderFormWithCachedRows({
            cachedRows: cachedLists,
            actions: { create, update: vi.fn() },
            entity: null,
            createdRowDefaults: { task_count: 0 },
        });
        act(() => formHook.current.setName('Fresh'));

        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });

        expect(queryClient.getQueryData(['lists'])).toEqual([
            ...cachedLists,
            { id: 'list-3', name: 'Fresh', task_count: 0 },
        ]);
    });

    it('leaves the cache alone on create when no defaults are given, so the refetch adds the row', async () => {
        const create = vi
            .fn()
            .mockResolvedValue({ data: { id: 'list-3', name: 'Fresh' }, error: null });
        const { formHook, queryClient } = renderFormWithCachedRows({
            cachedRows: cachedLists,
            actions: { create, update: vi.fn() },
            entity: null,
        });
        act(() => formHook.current.setName('Fresh'));

        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });

        expect(queryClient.getQueryData(['lists'])).toEqual(cachedLists);
    });
});

describe('useColorNameForm lock lifetime (dialog still on screen after onClose)', () => {
    it('stays locked after a successful save, because the dialog is still fading out', async () => {
        const create = vi.fn().mockResolvedValue({ error: null });
        const { formHook, onClose } = renderParentDrivenForm({
            create,
            update: vi.fn(),
            initialEntity: null,
        });
        act(() => formHook.current.setName('Groceries'));

        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(formHook.current.submitting).toBe(true);
    });

    it('keeps updating, not creating, when the parent clears the entity during the exit animation', async () => {
        const create = vi.fn().mockResolvedValue({ error: null });
        const update = vi.fn().mockResolvedValue({ error: null });
        const { formHook, closeLikeParent } = renderParentDrivenForm({
            create,
            update,
            initialEntity: { id: 'list-1', name: 'Groceries', color: '#112233' },
        });

        closeLikeParent();
        expect(formHook.current.isEditing).toBe(true);
        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });

        expect(update).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledWith(
            'list-1',
            expect.objectContaining({ name: 'Groceries' }),
        );
        expect(create).not.toHaveBeenCalled();
    });

    it('starts unlocked and in the right mode when the dialog is opened again', async () => {
        const create = vi.fn().mockResolvedValue({ error: null });
        const { formHook, reopenLikeParent, closeLikeParent } = renderParentDrivenForm({
            create,
            update: vi.fn(),
            initialEntity: null,
        });
        act(() => formHook.current.setName('Groceries'));
        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });
        closeLikeParent();

        reopenLikeParent({ id: 'list-9', name: 'Chores', color: '#445566' });

        expect(formHook.current.submitting).toBe(false);
        expect(formHook.current.isEditing).toBe(true);
        expect(formHook.current.name).toBe('Chores');
    });
});

describe('useColorNameForm client-made id for create', () => {
    beforeEach(() => {
        clientIds.counter = 0;
        clientIds.unavailable = false;
    });

    it('sends the same id when the user retries after a failed attempt', async () => {
        const create = vi
            .fn()
            .mockRejectedValueOnce(new Error('response lost'))
            .mockResolvedValue({ error: null });
        const { formHook } = renderParentDrivenForm({
            create,
            update: vi.fn(),
            initialEntity: null,
        });
        act(() => formHook.current.setName('Groceries'));

        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });
        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });

        expect(create).toHaveBeenCalledTimes(2);
        expect(create.mock.calls[0][0].id).toBeDefined();
        expect(create.mock.calls[1][0].id).toBe(create.mock.calls[0][0].id);
    });

    it('makes a new id each time the dialog is opened', async () => {
        const create = vi.fn().mockResolvedValue({ error: null });
        const { formHook, closeLikeParent, reopenLikeParent } = renderParentDrivenForm({
            create,
            update: vi.fn(),
            initialEntity: null,
        });
        act(() => formHook.current.setName('First'));
        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });
        closeLikeParent();
        reopenLikeParent(null);
        act(() => formHook.current.setName('Second'));
        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });

        expect(create.mock.calls[1][0].id).not.toBe(create.mock.calls[0][0].id);
    });

    it('sends no id when editing', async () => {
        const update = vi.fn().mockResolvedValue({ error: null });
        const { formHook } = renderParentDrivenForm({
            create: vi.fn(),
            update,
            initialEntity: { id: 'list-1', name: 'Groceries', color: '#112233' },
        });

        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });

        expect(update.mock.calls[0][1]).not.toHaveProperty('id');
    });

    it('sends no id when the browser cannot make one, leaving it to the server', async () => {
        clientIds.unavailable = true;
        const create = vi.fn().mockResolvedValue({ error: null });
        const { formHook } = renderParentDrivenForm({
            create,
            update: vi.fn(),
            initialEntity: null,
        });
        act(() => formHook.current.setName('Groceries'));

        await act(async () => {
            await formHook.current.handleSubmit(createSubmitEvent());
        });

        expect(create.mock.calls[0][0]).not.toHaveProperty('id');
    });
});
