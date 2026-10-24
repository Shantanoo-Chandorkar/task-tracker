import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StartTaskTimerSheet from './StartTaskTimerSheet';

vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => false }));

const sessionsState = vi.hoisted(() => ({ sessions: [] }));
const startMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useTimeSessionsQuery', () => ({
    useTimeSessionsQuery: () => ({ data: sessionsState.sessions }),
}));
vi.mock('@/hooks/useTimeSessionActions', () => ({
    useTimeSessionActions: () => ({ start: startMock }),
}));

// cmdk and Radix measure and scroll elements, which jsdom does not implement
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

const fetchResults = vi.fn();

beforeEach(() => {
    globalThis.fetch = (...args) => fetchResults(...args);
    sessionsState.sessions = [];
    startMock.mockReset();
});

afterEach(cleanup);

function renderSheet(onClose = vi.fn()) {
    render(
        <QueryClientProvider client={new QueryClient()}>
            <StartTaskTimerSheet open onClose={onClose} />
        </QueryClientProvider>,
    );
    return onClose;
}

function searchInput() {
    return screen.getByRole('combobox', { name: 'Search tasks' });
}

describe('StartTaskTimerSheet', () => {
    it('prompts to search before anything is typed', () => {
        renderSheet();
        expect(screen.getByText('Type to search')).toBeTruthy();
    });

    it('shows matching tasks once the search settles, marking a live one as already tracking', async () => {
        sessionsState.sessions = [{ task_id: 'task-2', habit_id: null, status: 'running' }];
        fetchResults.mockResolvedValue({
            ok: true,
            json: async () => ({
                tasks: [
                    { id: 'task-1', title: 'Write report', list_id: 'l1', list_name: 'Work' },
                    { id: 'task-2', title: 'Water plants', list_id: 'l2', list_name: 'Home' },
                ],
            }),
        });
        renderSheet();

        fireEvent.change(searchInput(), { target: { value: 'a' } });

        await waitFor(() => expect(screen.getByText('Write report')).toBeTruthy());
        expect(screen.getByText('Water plants')).toBeTruthy();
        expect(screen.getByText('Already tracking')).toBeTruthy();
    });

    it('says search is unavailable when the request fails', async () => {
        fetchResults.mockRejectedValue(new TypeError('Failed to fetch'));
        renderSheet();

        fireEvent.change(searchInput(), { target: { value: 'a' } });

        await waitFor(() =>
            expect(
                screen.getByText('Search is unavailable. Check your connection and try again.'),
            ).toBeTruthy(),
        );
    });

    it('starts a timer for the selected task and closes the sheet on success', async () => {
        fetchResults.mockResolvedValue({
            ok: true,
            json: async () => ({
                tasks: [{ id: 'task-1', title: 'Write report', list_id: 'l1', list_name: 'Work' }],
            }),
        });
        startMock.mockResolvedValue(true);
        const onClose = renderSheet();

        fireEvent.change(searchInput(), { target: { value: 'write' } });
        await waitFor(() => expect(screen.getByText('Write report')).toBeTruthy());
        fireEvent.click(screen.getByText('Write report'));

        await waitFor(() => expect(startMock).toHaveBeenCalledWith({ taskId: 'task-1' }));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('leaves the sheet open when starting the timer fails', async () => {
        fetchResults.mockResolvedValue({
            ok: true,
            json: async () => ({
                tasks: [{ id: 'task-1', title: 'Write report', list_id: 'l1', list_name: 'Work' }],
            }),
        });
        startMock.mockResolvedValue(false);
        const onClose = renderSheet();

        fireEvent.change(searchInput(), { target: { value: 'write' } });
        await waitFor(() => expect(screen.getByText('Write report')).toBeTruthy());
        fireEvent.click(screen.getByText('Write report'));

        await waitFor(() => expect(startMock).toHaveBeenCalled());
        expect(onClose).not.toHaveBeenCalled();
    });

    it('does not start a timer when the matching task already has a live session', async () => {
        sessionsState.sessions = [{ task_id: 'task-1', habit_id: null, status: 'running' }];
        fetchResults.mockResolvedValue({
            ok: true,
            json: async () => ({
                tasks: [{ id: 'task-1', title: 'Write report', list_id: 'l1', list_name: 'Work' }],
            }),
        });
        renderSheet();

        fireEvent.change(searchInput(), { target: { value: 'write' } });
        await waitFor(() => expect(screen.getByText('Already tracking')).toBeTruthy());
        fireEvent.click(screen.getByText('Write report'));

        expect(startMock).not.toHaveBeenCalled();
    });
});
