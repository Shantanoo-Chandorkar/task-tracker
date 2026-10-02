import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleQueryError } from './QueryProvider';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...args) => toastError(...args) } }));
vi.mock('@tanstack/react-query-devtools', () => ({ ReactQueryDevtools: () => null }));

beforeEach(() => toastError.mockReset());

describe('handleQueryError', () => {
    it('shows one fixed-id toast when a refresh fails and the screen already has data', () => {
        const queryWithData = { state: { data: [{ id: 't1' }] } };

        handleQueryError(new Error('boom'), queryWithData);
        handleQueryError(new Error('boom'), queryWithData);

        expect(toastError).toHaveBeenCalledTimes(2);
        const toastIds = toastError.mock.calls.map(([, toastOptions]) => toastOptions.id);
        expect(new Set(toastIds).size).toBe(1);
    });

    it('stays quiet when a first load fails, since the page shows its own error', () => {
        handleQueryError(new Error('boom'), { state: { data: undefined } });

        expect(toastError).not.toHaveBeenCalled();
    });

    it('never puts the error text in the toast', () => {
        handleQueryError(new Error('secret SQL detail'), { state: { data: [] } });

        expect(JSON.stringify(toastError.mock.calls)).not.toContain('secret SQL detail');
    });
});
