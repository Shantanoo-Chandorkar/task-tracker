import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTimeSessionActions } from './useTimeSessionActions';

const startTimeSession = vi.fn();
const pauseTimeSession = vi.fn();
const resumeTimeSession = vi.fn();
const completeTimeSession = vi.fn();
const discardTimeSession = vi.fn();

vi.mock('@/modules/timer/actions/time-session-actions', () => ({
    startTimeSession: (...args) => startTimeSession(...args),
    pauseTimeSession: (...args) => pauseTimeSession(...args),
    resumeTimeSession: (...args) => resumeTimeSession(...args),
    completeTimeSession: (...args) => completeTimeSession(...args),
    discardTimeSession: (...args) => discardTimeSession(...args),
}));
vi.mock('@/lib/client-id', () => ({ createClientId: () => 'client-id-1' }));
vi.mock('sonner', () => ({
    toast: {
        loading: () => 'toast-id',
        error: vi.fn(),
        success: vi.fn(),
        dismiss: vi.fn(),
    },
}));

function renderActionsHook() {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return { result: renderHook(() => useTimeSessionActions(), { wrapper }).result, queryClient };
}

describe('useTimeSessionActions', () => {
    beforeEach(() => vi.clearAllMocks());

    it('starts a session, invalidates the cache and returns true on success', async () => {
        startTimeSession.mockResolvedValue({ data: { id: 'session-1' }, error: null });
        const { result, queryClient } = renderActionsHook();

        const startResult = await result.current.start({ label: 'Deep work' });

        expect(startResult).toBe(true);
        expect(startTimeSession).toHaveBeenCalledWith({ label: 'Deep work', id: 'client-id-1' });
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['time-sessions'],
        });
    });

    it('shows the server error and returns false without invalidating', async () => {
        startTimeSession.mockResolvedValue({ data: null, error: 'Something went wrong' });
        const { result, queryClient } = renderActionsHook();

        const startResult = await result.current.start({ label: 'Deep work' });

        expect(startResult).toBe(false);
        expect(toast.error).toHaveBeenCalledWith('Something went wrong', { id: 'toast-id' });
        expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });

    it('shows an unreachable-server message when the call itself throws', async () => {
        startTimeSession.mockRejectedValue(new Error('network down'));
        const { result } = renderActionsHook();

        const startResult = await result.current.start({ label: 'Deep work' });

        expect(startResult).toBe(false);
        expect(toast.error).toHaveBeenCalledWith(
            'Could not reach the server. Check your connection and try again.',
            { id: 'toast-id' },
        );
    });

    it('pauses a session by id and invalidates on success', async () => {
        pauseTimeSession.mockResolvedValue({
            data: { id: 'session-1', status: 'paused' },
            error: null,
        });
        const { result, queryClient } = renderActionsHook();

        const pauseResult = await result.current.pause('session-1');

        expect(pauseResult).toBe(true);
        expect(pauseTimeSession).toHaveBeenCalledWith('session-1');
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['time-sessions'],
        });
    });

    it('discards a session by id and invalidates on success', async () => {
        discardTimeSession.mockResolvedValue({ error: null });
        const { result, queryClient } = renderActionsHook();

        const discardResult = await result.current.discard('session-1');

        expect(discardResult).toBe(true);
        expect(discardTimeSession).toHaveBeenCalledWith('session-1');
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['time-sessions'],
        });
    });
});
