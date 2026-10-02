import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useColorNameForm } from './useColorNameForm';

vi.mock('@/lib/service-worker-cache', () => ({ bustPageCache: vi.fn() }));

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
    it('stays locked until the dialog closes, so a second submit creates nothing extra', async () => {
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
        expect(onClose).not.toHaveBeenCalled();

        await act(async () => {
            releaseRefetch();
            await firstSubmit;
        });
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(formHook.current.submitting).toBe(false);
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
