import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import AuthKeepAlive from './AuthKeepAlive';

const clearAllCaches = vi.fn();
const assignLocation = vi.fn();
const fetchMock = vi.fn();
const callOrder = [];

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ marker: 'query-client' }) }));
vi.mock('@/lib/cache/clear-client-caches', () => ({
    clearAllCaches: (...args) => clearAllCaches(...args),
}));

/** Mounts the component, then fires the `online` trigger once the one-minute gap has passed. */
async function triggerRefreshWithResponse(response) {
    fetchMock.mockResolvedValue(response);
    render(<AuthKeepAlive />);
    await vi.advanceTimersByTimeAsync(61 * 1000);
    window.dispatchEvent(new Event('online'));
    // Resume refreshes are jittered by up to 2s; advance past the whole window to let it fire.
    await vi.advanceTimersByTimeAsync(2000);
}

describe('AuthKeepAlive', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        callOrder.length = 0;
        clearAllCaches.mockReset().mockImplementation(async () => {
            callOrder.push('clear');
        });
        assignLocation.mockReset().mockImplementation(() => callOrder.push('redirect'));
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('location', { assign: assignLocation });
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true,
        });
    });

    it('clears cached data before sending a signed-out user to /login', async () => {
        await triggerRefreshWithResponse({
            status: 401,
            json: async () => ({ code: 'NOT_AUTHENTICATED' }),
        });

        expect(callOrder).toEqual(['clear', 'redirect']);
        expect(assignLocation).toHaveBeenCalledWith('/login');
        expect(clearAllCaches).toHaveBeenCalledWith({ marker: 'query-client' });
    });

    it('clears cached data and shows the expired-guest login when the guest session ended', async () => {
        await triggerRefreshWithResponse({
            status: 401,
            json: async () => ({ code: 'GUEST_SESSION_EXPIRED' }),
        });

        expect(callOrder).toEqual(['clear', 'redirect']);
        expect(assignLocation).toHaveBeenCalledWith('/login?reason=guest-expired');
    });

    it('leaves caches and the page alone while the session is still valid', async () => {
        await triggerRefreshWithResponse({ status: 200, json: async () => ({}) });

        expect(clearAllCaches).not.toHaveBeenCalled();
        expect(assignLocation).not.toHaveBeenCalled();
    });

    it('leaves caches and the page alone on a 401 with an unknown code', async () => {
        await triggerRefreshWithResponse({ status: 401, json: async () => ({ code: 'WEIRD' }) });

        expect(clearAllCaches).not.toHaveBeenCalled();
        expect(assignLocation).not.toHaveBeenCalled();
    });

    it('delays a resume refresh with jitter instead of firing immediately', async () => {
        fetchMock.mockResolvedValue({ status: 200, json: async () => ({}) });
        render(<AuthKeepAlive />);
        await vi.advanceTimersByTimeAsync(61 * 1000);

        window.dispatchEvent(new Event('online'));
        expect(fetchMock).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(2000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('skips a resume refresh if the tab goes hidden again during the jitter delay', async () => {
        fetchMock.mockResolvedValue({ status: 200, json: async () => ({}) });
        render(<AuthKeepAlive />);
        await vi.advanceTimersByTimeAsync(61 * 1000);

        window.dispatchEvent(new Event('online'));
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        await vi.advanceTimersByTimeAsync(2000);

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
