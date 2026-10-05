import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { REORDER_BUSY_MESSAGE } from '@/lib/in-flight-entities';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import StatusManager from './StatusManager';

const statuses = [
    { id: 's1', name: 'To do', color: '#111111', position: 0, is_default: true, code: 'todo' },
    { id: 's2', name: 'Doing', color: '#222222', position: 1, is_default: false, code: null },
];

vi.mock('@/hooks/useStatusesQuery', () => ({
    useStatusesQuery: () => ({ data: statuses, isLoading: false }),
}));
const reorderStatuses = vi.fn();
vi.mock('@/actions/status-actions', () => ({ deleteStatus: vi.fn() }));
vi.mock('@/actions/reorder-actions', () => ({
    reorderStatuses: (...args) => reorderStatuses(...args),
}));
vi.mock('sonner', () => ({
    toast: { loading: () => 'toast-id', success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('./StatusFormDialog', () => ({ default: () => null }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));

// Radix positions the menu with a ResizeObserver, which jsdom does not provide
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

afterEach(cleanup);

let lastQueryClient;

function renderManager() {
    lastQueryClient = new QueryClient();
    lastQueryClient.setQueryData(['statuses', 'space-1'], statuses);
    return render(
        <QueryClientProvider client={lastQueryClient}>
            <StatusManager spaceId="space-1" />
        </QueryClientProvider>,
    );
}

describe('StatusManager drag handles', () => {
    it('puts the sortable semantics on each drag handle', () => {
        renderManager();

        const handles = screen.getAllByRole('button', { name: /Drag to reorder/ });
        expect(handles).toHaveLength(2);
        for (const handle of handles) {
            expect(handle.getAttribute('aria-roledescription')).toBe('sortable');
        }
    });

    it('keeps the row itself out of the tab order, since it only holds other controls', () => {
        const { container } = renderManager();

        const sortableElements = container.querySelectorAll('[aria-roledescription="sortable"]');
        expect(sortableElements).toHaveLength(2);
        for (const element of sortableElements) {
            expect(element.tagName).toBe('BUTTON');
        }
    });
});

function openRowMenu(statusName) {
    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions for ${statusName}` }), {
        button: 0,
        ctrlKey: false,
    });
}

describe('StatusManager row menu', () => {
    it('names each drag handle after its status', () => {
        renderManager();

        expect(screen.getByRole('button', { name: 'Drag to reorder To do' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Drag to reorder Doing' })).toBeTruthy();
    });

    it('offers Edit, Move up, Move down and Delete in one menu', async () => {
        renderManager();
        openRowMenu('Doing');

        for (const name of ['Edit', 'Move up', 'Move down', 'Delete']) {
            expect(await screen.findByRole('menuitem', { name })).toBeTruthy();
        }
    });

    it('disables Move up on the first status and Move down on the last', async () => {
        renderManager();
        openRowMenu('To do');

        const moveUp = await screen.findByRole('menuitem', { name: 'Move up' });
        expect(moveUp.getAttribute('aria-disabled')).toBe('true');
        expect(
            screen.getByRole('menuitem', { name: 'Move down' }).getAttribute('aria-disabled'),
        ).toBeNull();
    });

    it('says why a built-in default status cannot be deleted, on the disabled item itself', async () => {
        renderManager();
        openRowMenu('To do');

        const reason = await screen.findByRole('menuitem', {
            name: 'Cannot delete the default status',
        });
        expect(reason.getAttribute('aria-disabled')).toBe('true');
    });

    it('saves the swapped order when Move up is chosen', async () => {
        reorderStatuses.mockResolvedValue({ error: null });
        renderManager();
        openRowMenu('Doing');

        fireEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));

        await waitFor(() => expect(reorderStatuses).toHaveBeenCalledTimes(1));
        expect(reorderStatuses).toHaveBeenCalledWith('space-1', ['s2', 's1']);
    });
});

describe('StatusManager reorder save', () => {
    beforeEach(() => vi.clearAllMocks());

    async function moveDoingUp() {
        openRowMenu('Doing');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));
    }

    it('shows the new order in the cache at once, before the save finishes', async () => {
        let finishSave;
        reorderStatuses.mockReturnValue(new Promise((resolve) => (finishSave = resolve)));
        renderManager();

        await moveDoingUp();
        await waitFor(() => expect(reorderStatuses).toHaveBeenCalledTimes(1));

        expect(lastQueryClient.getQueryData(['statuses', 'space-1']).map((row) => row.id)).toEqual([
            's2',
            's1',
        ]);
        await act(async () => finishSave({ error: null }));
    });

    it('confirms with Order saved and clears the cached list pages', async () => {
        reorderStatuses.mockResolvedValue({ error: null });
        renderManager();

        await moveDoingUp();

        await waitFor(() =>
            expect(toast.success).toHaveBeenCalledWith('Order saved', { id: 'toast-id' }),
        );
        expect(bustPageCache).toHaveBeenCalledWith({ prefixes: ['/lists/'] });
    });

    it('shows the first refusal and does not confirm', async () => {
        reorderStatuses.mockResolvedValue({ error: 'Not allowed' });
        renderManager();

        await moveDoingUp();

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('Not allowed', { id: 'toast-id' }),
        );
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('says the server could not be reached when a save throws', async () => {
        reorderStatuses.mockRejectedValue(new Error('offline'));
        renderManager();

        await moveDoingUp();

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('Could not reach the server. Try again.', {
                id: 'toast-id',
            }),
        );
    });

    it('turns away a second reorder while one is saving', async () => {
        let finishSave;
        reorderStatuses.mockReturnValue(new Promise((resolve) => (finishSave = resolve)));
        renderManager();

        await moveDoingUp();
        await waitFor(() => expect(reorderStatuses).toHaveBeenCalledTimes(1));
        openRowMenu('To do');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Move down' }));

        expect(toast.info).toHaveBeenCalledWith(REORDER_BUSY_MESSAGE);
        expect(reorderStatuses).toHaveBeenCalledTimes(1);
        await act(async () => finishSave({ error: null }));
    });
});
