import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StatusManager from './StatusManager';

const statuses = [
    { id: 's1', name: 'To do', color: '#111111', position: 0, is_default: true, code: 'todo' },
    { id: 's2', name: 'Doing', color: '#222222', position: 1, is_default: false, code: null },
];

vi.mock('@/hooks/useStatusesQuery', () => ({
    useStatusesQuery: () => ({ data: statuses, isLoading: false }),
}));
const updateStatus = vi.fn();
vi.mock('@/actions/status-actions', () => ({
    updateStatus: (...args) => updateStatus(...args),
    deleteStatus: vi.fn(),
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

function renderManager() {
    return render(
        <QueryClientProvider client={new QueryClient()}>
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
        updateStatus.mockResolvedValue({ error: null });
        renderManager();
        openRowMenu('Doing');

        fireEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));

        await waitFor(() => expect(updateStatus).toHaveBeenCalledTimes(2));
        expect(updateStatus).toHaveBeenCalledWith('s2', { position: 0 });
        expect(updateStatus).toHaveBeenCalledWith('s1', { position: 1 });
    });
});
