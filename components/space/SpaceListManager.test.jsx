import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SpaceListManager from './SpaceListManager';

const USER_ID = 'user-1';
const spaces = [
    { id: 'sp1', name: 'Home', color: '#111111', position: 0, owner_id: USER_ID },
    { id: 'sp2', name: 'Work', color: '#222222', position: 1, owner_id: USER_ID },
];
const lists = [
    { id: 'l1', name: 'Groceries', color: '#333333', position: 0, space_id: 'sp1' },
    { id: 'l2', name: 'Chores', color: '#444444', position: 1, space_id: 'sp1' },
];

const updateSpace = vi.fn();
const updateList = vi.fn();

vi.mock('next/link', () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
vi.mock('@/hooks/useSpacesQuery', () => ({ useSpacesQuery: () => ({ data: spaces }) }));
vi.mock('@/hooks/useListsQuery', () => ({ useListsQuery: () => ({ data: lists }) }));
vi.mock('@/hooks/useCurrentUserProfileQuery', () => ({
    useCurrentUserProfileQuery: () => ({ data: { is_guest: true } }),
}));
vi.mock('@/actions/space-actions', () => ({
    updateSpace: (...args) => updateSpace(...args),
    deleteSpace: vi.fn(),
}));
vi.mock('@/actions/list-actions', () => ({
    updateList: (...args) => updateList(...args),
    deleteList: vi.fn(),
}));
vi.mock('@/actions/collaboration-actions', () => ({ leaveSpace: vi.fn() }));
vi.mock('sonner', () => ({
    toast: {
        loading: () => 'toast-id',
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        dismiss: vi.fn(),
    },
}));
vi.mock('@/lib/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('./SpaceFormDialog', () => ({ default: () => null }));
vi.mock('./ListFormDialog', () => ({ default: () => null }));
vi.mock('./JoinSpaceDialog', () => ({ default: () => null }));
vi.mock('./SpaceSharingSection', () => ({ default: () => null }));
vi.mock('./SpaceSettingsSheet', () => ({ default: () => null }));

// Radix positions the menu with a ResizeObserver, which jsdom does not provide
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function renderManager() {
    render(
        <QueryClientProvider client={new QueryClient()}>
            <SpaceListManager currentUserId={USER_ID} />
        </QueryClientProvider>,
    );
}

function openMenu(rowName) {
    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions for ${rowName}` }), {
        button: 0,
        ctrlKey: false,
    });
}

describe('SpaceListManager row menus', () => {
    it('names every drag handle and menu button after its space or list', () => {
        renderManager();

        for (const rowName of ['Home', 'Work', 'Groceries', 'Chores']) {
            expect(screen.getByRole('button', { name: `Drag to reorder ${rowName}` })).toBeTruthy();
            expect(
                screen.getByRole('button', { name: `More actions for ${rowName}` }),
            ).toBeTruthy();
        }
    });

    it('no longer shows loose Edit and Delete icon buttons', () => {
        renderManager();

        expect(screen.queryByRole('button', { name: /^Edit (space|list)$/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /^Delete (space|list)$/ })).toBeNull();
    });

    it('puts Edit, Move up, Move down and Delete in a space menu', async () => {
        renderManager();
        openMenu('Home');

        for (const name of ['Edit', 'Move up', 'Move down', 'Delete']) {
            expect(await screen.findByRole('menuitem', { name })).toBeTruthy();
        }
    });

    it('disables Move up on the first space', async () => {
        renderManager();
        openMenu('Home');

        const moveUp = await screen.findByRole('menuitem', { name: 'Move up' });
        expect(moveUp.getAttribute('aria-disabled')).toBe('true');
    });

    it('saves the swapped order of two spaces when Move down is chosen on the first', async () => {
        updateSpace.mockResolvedValue({ error: null });
        renderManager();
        openMenu('Home');

        fireEvent.click(await screen.findByRole('menuitem', { name: 'Move down' }));

        await waitFor(() => expect(updateSpace).toHaveBeenCalledTimes(2));
        expect(updateSpace).toHaveBeenCalledWith('sp2', { position: 0 });
        expect(updateSpace).toHaveBeenCalledWith('sp1', { position: 1 });
        expect(updateList).not.toHaveBeenCalled();
    });

    it('saves the swapped order of two lists in the same space when Move up is chosen on the second', async () => {
        updateList.mockResolvedValue({ error: null });
        renderManager();
        openMenu('Chores');

        fireEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));

        await waitFor(() => expect(updateList).toHaveBeenCalledTimes(2));
        expect(updateList).toHaveBeenCalledWith('l2', { position: 0 });
        expect(updateList).toHaveBeenCalledWith('l1', { position: 1 });
        expect(updateSpace).not.toHaveBeenCalled();
    });
});
