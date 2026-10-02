import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useConfirmAction } from './useConfirmAction';

const toastDismiss = vi.fn();
const toastSuccess = vi.fn();

vi.mock('sonner', () => ({
    toast: {
        loading: () => 'toast-id',
        success: (...args) => toastSuccess(...args),
        dismiss: (...args) => toastDismiss(...args),
    },
}));

let nextEntityNumber = 0;

function buildOptions(overrides = {}) {
    return {
        entityKey: `confirm-test:${nextEntityNumber++}`,
        loadingMessage: 'Deleting...',
        successMessage: 'Deleted',
        action: vi.fn().mockResolvedValue({ error: null }),
        onSuccess: vi.fn(),
        close: vi.fn(),
        ...overrides,
    };
}

describe('useConfirmAction', () => {
    beforeEach(() => vi.clearAllMocks());

    it('stays pending through the screen update and closes only after it', async () => {
        const order = [];
        const options = buildOptions({
            onSuccess: vi.fn(async () => {
                await Promise.resolve();
                order.push('screen updated');
            }),
            close: vi.fn(() => order.push('closed')),
        });
        const { result } = renderHook(() => useConfirmAction(true));

        let wasSuccessful;
        await act(async () => {
            wasSuccessful = await result.current.runConfirmedAction(options);
        });

        expect(order).toEqual(['screen updated', 'closed']);
        expect(wasSuccessful).toBe(true);
        expect(result.current.isPending).toBe(true);
        expect(toastSuccess).toHaveBeenCalledWith('Deleted', { id: 'toast-id' });
    });

    it('is pending while the server call is in flight', async () => {
        let finishAction;
        const options = buildOptions({
            action: () => new Promise((resolve) => (finishAction = resolve)),
        });
        const { result } = renderHook(() => useConfirmAction(true));

        let running;
        act(() => {
            running = result.current.runConfirmedAction(options);
        });
        expect(result.current.isPending).toBe(true);
        expect(options.close).not.toHaveBeenCalled();

        await act(async () => {
            finishAction({ error: null });
            await running;
        });
        expect(options.close).toHaveBeenCalledTimes(1);
    });

    it('keeps the popup open, shows the server error and unlocks when the server says no', async () => {
        const options = buildOptions({
            action: vi.fn().mockResolvedValue({ error: 'You cannot delete this' }),
        });
        const { result } = renderHook(() => useConfirmAction(true));

        let wasSuccessful;
        await act(async () => {
            wasSuccessful = await result.current.runConfirmedAction(options);
        });

        expect(wasSuccessful).toBe(false);
        expect(result.current.errorMessage).toBe('You cannot delete this');
        expect(result.current.isPending).toBe(false);
        expect(options.onSuccess).not.toHaveBeenCalled();
        expect(options.close).not.toHaveBeenCalled();
    });

    it('shows a connection message and unlocks when the call itself fails', async () => {
        const options = buildOptions({ action: vi.fn().mockRejectedValue(new Error('offline')) });
        const { result } = renderHook(() => useConfirmAction(true));

        await act(async () => {
            await result.current.runConfirmedAction(options);
        });

        expect(result.current.errorMessage).toContain('Could not reach the server');
        expect(result.current.isPending).toBe(false);
        expect(options.close).not.toHaveBeenCalled();
    });

    it('starts only one request when the confirm button is pressed repeatedly', async () => {
        let finishAction;
        const options = buildOptions({
            action: vi.fn(() => new Promise((resolve) => (finishAction = resolve))),
        });
        const { result } = renderHook(() => useConfirmAction(true));

        let firstRun;
        act(() => {
            firstRun = result.current.runConfirmedAction(options);
            result.current.runConfirmedAction(options);
        });
        expect(options.action).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishAction({ error: null });
            await firstRun;
        });
    });

    it('starts clean the next time the popup opens', async () => {
        const failing = buildOptions({ action: vi.fn().mockResolvedValue({ error: 'Nope' }) });
        const { result, rerender } = renderHook(({ isOpen }) => useConfirmAction(isOpen), {
            initialProps: { isOpen: true },
        });
        await act(async () => {
            await result.current.runConfirmedAction(failing);
        });
        expect(result.current.errorMessage).toBe('Nope');

        rerender({ isOpen: false });
        rerender({ isOpen: true });

        expect(result.current.errorMessage).toBe('');
        expect(result.current.isPending).toBe(false);
    });
});
