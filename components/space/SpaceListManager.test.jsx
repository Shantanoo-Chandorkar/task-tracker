import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { REORDER_BUSY_MESSAGE } from '@/lib/in-flight-entities';
import { PERMISSION_LEVEL_LABELS } from '@/lib/permissions/space-permissions';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import { fetchDeleteCounts } from '@/lib/fetch-delete-counts';
import SpaceListManager from './SpaceListManager';

const USER_ID = 'user-1';
const OWNED_SPACES = [
    { id: 'sp1', name: 'Home', color: '#111111', position: 0, owner_id: USER_ID },
    { id: 'sp2', name: 'Work', color: '#222222', position: 1, owner_id: USER_ID },
];
const SHARED_SPACE = {
    id: 'sp3',
    name: 'Team',
    color: '#555555',
    position: 0,
    owner_id: 'someone-else',
    my_permission_level: 'full',
};
const OWNED_LISTS = [
    { id: 'l1', name: 'Groceries', color: '#333333', position: 0, space_id: 'sp1', task_count: 1 },
    { id: 'l2', name: 'Chores', color: '#444444', position: 1, space_id: 'sp1', task_count: 2 },
];
const SHARED_LISTS = [
    { id: 'l3', name: 'Sprint', color: '#666666', position: 0, space_id: 'sp3', task_count: 0 },
    { id: 'l4', name: 'Backlog', color: '#777777', position: 1, space_id: 'sp3', task_count: 0 },
];

const mocks = vi.hoisted(() => ({
    spaces: [],
    lists: [],
    isGuest: true,
    reorderSpaces: vi.fn(),
    reorderLists: vi.fn(),
    deleteSpace: vi.fn(),
    deleteList: vi.fn(),
    leaveSpace: vi.fn(),
}));

vi.mock('next/link', () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
vi.mock('@/hooks/useSpacesQuery', () => ({ useSpacesQuery: () => ({ data: mocks.spaces }) }));
vi.mock('@/hooks/useListsQuery', () => ({ useListsQuery: () => ({ data: mocks.lists }) }));
vi.mock('@/hooks/useCurrentUserProfileQuery', () => ({
    useCurrentUserProfileQuery: () => ({ data: { is_guest: mocks.isGuest } }),
}));
vi.mock('@/actions/space-actions', () => ({
    deleteSpace: (...args) => mocks.deleteSpace(...args),
}));
vi.mock('@/actions/list-actions', () => ({
    deleteList: (...args) => mocks.deleteList(...args),
}));
vi.mock('@/actions/reorder-actions', () => ({
    reorderSpaces: (...args) => mocks.reorderSpaces(...args),
    reorderLists: (...args) => mocks.reorderLists(...args),
}));
vi.mock('@/actions/collaboration-actions', () => ({
    leaveSpace: (...args) => mocks.leaveSpace(...args),
}));
vi.mock('sonner', () => ({
    toast: {
        loading: vi.fn(() => 'toast-id'),
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        dismiss: vi.fn(),
    },
}));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('@/lib/fetch-delete-counts', () => ({ fetchDeleteCounts: vi.fn() }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('./SpaceFormDialog', () => ({
    default: ({ open, space }) =>
        open ? <div>{`space-dialog:${space?.name ?? 'new'}`}</div> : null,
}));
vi.mock('./ListFormDialog', () => ({
    default: ({ open, list, defaultSpaceId }) =>
        open ? <div>{`list-dialog:${list?.name ?? 'new'}:${defaultSpaceId ?? 'none'}`}</div> : null,
}));
vi.mock('./JoinSpaceDialog', () => ({
    default: ({ open, onClose, initialSpaceId }) =>
        open ? (
            <div>
                <span>{`join-dialog:${initialSpaceId}`}</span>
                <button onClick={onClose}>close-join</button>
            </div>
        ) : null,
}));
vi.mock('./SpaceSharingSection', () => ({
    default: ({ space }) => <div>{`sharing:${space.id}`}</div>,
}));
vi.mock('./SpaceSettingsSheet', () => ({
    default: ({ open, spaceId }) => (open ? <div>{`settings:${spaceId}`}</div> : null),
}));

// Radix positions the menu with a ResizeObserver, which jsdom does not provide
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.spaces = OWNED_SPACES;
    mocks.lists = OWNED_LISTS;
    mocks.isGuest = true;
    fetchDeleteCounts.mockResolvedValue(null);
});
afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
});

function renderManager({ withSharedSpace = false } = {}) {
    if (withSharedSpace) {
        mocks.spaces = [...OWNED_SPACES, SHARED_SPACE];
        mocks.lists = [...OWNED_LISTS, ...SHARED_LISTS];
    }
    const queryClient = new QueryClient();
    queryClient.setQueryData(['spaces'], mocks.spaces);
    queryClient.setQueryData(['lists'], mocks.lists);
    render(
        <QueryClientProvider client={queryClient}>
            <SpaceListManager currentUserId={USER_ID} />
        </QueryClientProvider>,
    );
    return queryClient;
}

function openMenu(rowName) {
    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions for ${rowName}` }), {
        button: 0,
        ctrlKey: false,
    });
}

async function chooseMenuItem(rowName, itemName) {
    openMenu(rowName);
    fireEvent.click(await screen.findByRole('menuitem', { name: itemName }));
}

function cachedIds(queryClient, queryKey) {
    return queryClient.getQueryData(queryKey).map((row) => row.id);
}

function pendingPromise() {
    let resolve;
    const promise = new Promise((resolvePromise) => (resolve = resolvePromise));
    return { promise, resolve };
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
        mocks.reorderSpaces.mockResolvedValue({ error: null });
        renderManager();
        openMenu('Home');

        fireEvent.click(await screen.findByRole('menuitem', { name: 'Move down' }));

        await waitFor(() => expect(mocks.reorderSpaces).toHaveBeenCalledTimes(1));
        expect(mocks.reorderSpaces).toHaveBeenCalledWith(['sp2', 'sp1']);
        expect(mocks.reorderLists).not.toHaveBeenCalled();
    });

    it('saves the swapped order of two lists in the same space when Move up is chosen on the second', async () => {
        mocks.reorderLists.mockResolvedValue({ error: null });
        renderManager();
        openMenu('Chores');

        fireEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));

        await waitFor(() => expect(mocks.reorderLists).toHaveBeenCalledTimes(1));
        expect(mocks.reorderLists).toHaveBeenCalledWith('sp1', ['l2', 'l1']);
        expect(mocks.reorderSpaces).not.toHaveBeenCalled();
    });
});

describe('SpaceListManager reorder save', () => {
    it('shows the new space order in the cache at once, keeping shared spaces last', async () => {
        const pendingSave = pendingPromise();
        mocks.reorderSpaces.mockReturnValue(pendingSave.promise);
        const queryClient = renderManager({ withSharedSpace: true });

        await chooseMenuItem('Home', 'Move down');
        await waitFor(() => expect(mocks.reorderSpaces).toHaveBeenCalledTimes(1));

        expect(cachedIds(queryClient, ['spaces'])).toEqual(['sp2', 'sp1', 'sp3']);
        await act(async () => pendingSave.resolve({ error: null }));
    });

    it('shows the new list order in the cache, leaving other spaces lists where they are', async () => {
        const pendingSave = pendingPromise();
        mocks.reorderLists.mockReturnValue(pendingSave.promise);
        const queryClient = renderManager({ withSharedSpace: true });

        await chooseMenuItem('Chores', 'Move up');
        await waitFor(() => expect(mocks.reorderLists).toHaveBeenCalledTimes(1));

        expect(cachedIds(queryClient, ['lists'])).toEqual(['l2', 'l1', 'l3', 'l4']);
        await act(async () => pendingSave.resolve({ error: null }));
    });

    it('reorders lists of a shared space', async () => {
        mocks.reorderLists.mockResolvedValue({ error: null });
        renderManager({ withSharedSpace: true });

        await chooseMenuItem('Backlog', 'Move up');

        await waitFor(() => expect(mocks.reorderLists).toHaveBeenCalledTimes(1));
        expect(mocks.reorderLists).toHaveBeenCalledWith('sp3', ['l4', 'l3']);
    });

    it('confirms with Order saved once the save and reload are done', async () => {
        mocks.reorderSpaces.mockResolvedValue({ error: null });
        renderManager();

        await chooseMenuItem('Home', 'Move down');

        await waitFor(() =>
            expect(toast.success).toHaveBeenCalledWith('Order saved', { id: 'toast-id' }),
        );
        expect(toast.loading).toHaveBeenCalledWith('Saving order...');
        expect(bustPageCache).toHaveBeenCalledWith({ urls: ['/spaces'] });
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('shows the first refusal from the server and does not confirm', async () => {
        mocks.reorderSpaces.mockResolvedValue({ error: 'Not allowed' });
        renderManager();

        await chooseMenuItem('Home', 'Move down');

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('Not allowed', { id: 'toast-id' }),
        );
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('says the server could not be reached when a save throws', async () => {
        mocks.reorderLists.mockRejectedValue(new Error('network down'));
        renderManager();

        await chooseMenuItem('Chores', 'Move up');

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('Could not reach the server. Try again.', {
                id: 'toast-id',
            }),
        );
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('turns away a second reorder while one is saving', async () => {
        const pendingSave = pendingPromise();
        mocks.reorderSpaces.mockReturnValue(pendingSave.promise);
        renderManager();

        await chooseMenuItem('Home', 'Move down');
        await waitFor(() => expect(mocks.reorderSpaces).toHaveBeenCalledTimes(1));
        await chooseMenuItem('Work', 'Move up');

        expect(toast.info).toHaveBeenCalledWith(REORDER_BUSY_MESSAGE);
        expect(mocks.reorderSpaces).toHaveBeenCalledTimes(1);
        await act(async () => pendingSave.resolve({ error: null }));
    });
});

describe('SpaceListManager shared spaces', () => {
    it('lists a shared space apart, with its access badge and no space controls', () => {
        renderManager({ withSharedSpace: true });

        expect(screen.getAllByText('Shared with you')).toHaveLength(2);
        expect(screen.getByText(`${PERMISSION_LEVEL_LABELS.full} access`)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Drag to reorder Team' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'More actions for Team' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Leave space' })).toBeTruthy();
    });

    it('shows no Shared section and no Leave button when every space is owned', () => {
        renderManager();

        expect(screen.queryByText('Shared with you')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Leave space' })).toBeNull();
    });
});

describe('SpaceListManager dialogs and toggles', () => {
    it('opens the space dialog empty for Add space and filled for Edit', async () => {
        renderManager();

        fireEvent.click(screen.getByRole('button', { name: '+ Add space' }));
        expect(screen.getByText('space-dialog:new')).toBeTruthy();
        cleanup();

        renderManager();
        await chooseMenuItem('Home', 'Edit');
        expect(screen.getByText('space-dialog:Home')).toBeTruthy();
    });

    it('opens the list dialog for a space on Add list and for a list on Edit', async () => {
        renderManager();

        fireEvent.click(screen.getAllByRole('button', { name: '+ Add list' })[0]);
        expect(screen.getByText('list-dialog:new:sp1')).toBeTruthy();
        cleanup();

        renderManager();
        await chooseMenuItem('Groceries', 'Edit');
        expect(screen.getByText('list-dialog:Groceries:none')).toBeTruthy();
    });

    it('opens the settings sheet of the space whose button was pressed', () => {
        renderManager();

        fireEvent.click(screen.getAllByRole('button', { name: 'Space settings' })[1]);

        expect(screen.getByText('settings:sp2')).toBeTruthy();
    });

    it('hides Join a space and Share this space from guests', () => {
        renderManager();

        expect(screen.queryByRole('button', { name: 'Join a space' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Share this space' })).toBeNull();
    });

    it('lets a registered owner open and close the sharing panel of an owned space only', () => {
        mocks.isGuest = false;
        renderManager({ withSharedSpace: true });

        const shareButtons = screen.getAllByRole('button', { name: /Share this space/ });
        expect(shareButtons).toHaveLength(2);
        expect(shareButtons[0].getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(shareButtons[0]);
        expect(screen.getByText('sharing:sp1')).toBeTruthy();
        expect(shareButtons[0].getAttribute('aria-expanded')).toBe('true');

        fireEvent.click(shareButtons[0]);
        expect(screen.queryByText('sharing:sp1')).toBeNull();
    });

    it('opens the join dialog from the button with no prefilled id', () => {
        mocks.isGuest = false;
        renderManager();

        fireEvent.click(screen.getByRole('button', { name: 'Join a space' }));

        expect(screen.getByText('join-dialog:')).toBeTruthy();
    });

    it('opens the join dialog on load when the address carries a join id, and clears it on close', () => {
        window.history.pushState(null, '', '/spaces?join=space-abc');
        renderManager();

        expect(screen.getByText('join-dialog:space-abc')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'close-join' }));

        expect(screen.queryByText('join-dialog:space-abc')).toBeNull();
        expect(window.location.pathname + window.location.search).toBe('/spaces');
    });
});

describe('SpaceListManager delete and leave', () => {
    it('asks before deleting a space and counts its lists and tasks from the cache', async () => {
        renderManager();

        await chooseMenuItem('Home', 'Delete');

        expect(await screen.findByText('Delete "Home"?')).toBeTruthy();
        expect(
            screen.getByText('This deletes 2 lists and 3 tasks. This cannot be undone.'),
        ).toBeTruthy();
    });

    it('swaps in the counts the server sends once they arrive', async () => {
        fetchDeleteCounts.mockResolvedValue({ list_count: 1, task_count: 1 });
        renderManager();

        await chooseMenuItem('Home', 'Delete');

        expect(
            await screen.findByText('This deletes 1 list and 1 task. This cannot be undone.'),
        ).toBeTruthy();
        expect(fetchDeleteCounts).toHaveBeenCalledWith('/api/spaces/sp1');
    });

    it('keeps the popup open and locked while a space delete runs, then closes it onto the final cache', async () => {
        const pendingDelete = pendingPromise();
        mocks.deleteSpace.mockReturnValue(pendingDelete.promise);
        const queryClient = renderManager();
        await chooseMenuItem('Home', 'Delete');
        await screen.findByText('Delete "Home"?');

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(mocks.deleteSpace).toHaveBeenCalledWith('sp1'));
        expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
        expect(screen.getByText('Delete "Home"?')).toBeTruthy();

        await act(async () => pendingDelete.resolve({ error: null }));

        await waitFor(() => expect(screen.queryByText('Delete "Home"?')).toBeNull());
        expect(cachedIds(queryClient, ['spaces'])).toEqual(['sp2']);
        expect(queryClient.getQueryData(['lists'])).toEqual([]);
        expect(toast.success).toHaveBeenCalledWith('Space deleted', { id: 'toast-id' });
        expect(bustPageCache).toHaveBeenCalledWith({ prefixes: ['/lists/'] });
    });

    it('deletes a list, removes only that list from the cache and clears its page cache', async () => {
        mocks.deleteList.mockResolvedValue({ error: null });
        const queryClient = renderManager();
        await chooseMenuItem('Groceries', 'Delete');
        expect(await screen.findByText('This deletes 1 task. This cannot be undone.')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(mocks.deleteList).toHaveBeenCalledWith('l1'));
        await waitFor(() => expect(screen.queryByText('Delete "Groceries"?')).toBeNull());
        expect(cachedIds(queryClient, ['lists'])).toEqual(['l2']);
        expect(cachedIds(queryClient, ['spaces'])).toEqual(['sp1', 'sp2']);
        expect(toast.success).toHaveBeenCalledWith('List deleted', { id: 'toast-id' });
        expect(bustPageCache).toHaveBeenCalledWith({ urls: ['/lists/l1'] });
    });

    it('stays open with the server message when a delete is refused', async () => {
        mocks.deleteList.mockResolvedValue({ error: 'Failed to delete list' });
        const queryClient = renderManager();
        await chooseMenuItem('Groceries', 'Delete');
        await screen.findByText('Delete "Groceries"?');

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        expect(await screen.findByText('Failed to delete list')).toBeTruthy();
        expect(screen.getByText('Delete "Groceries"?')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Delete' }).disabled).toBe(false);
        expect(cachedIds(queryClient, ['lists'])).toEqual(['l1', 'l2']);
    });

    it('leaves a shared space after confirming, and drops it and its lists from the cache', async () => {
        mocks.leaveSpace.mockResolvedValue({ error: null });
        const queryClient = renderManager({ withSharedSpace: true });

        fireEvent.click(screen.getByRole('button', { name: 'Leave space' }));

        expect(await screen.findByText('Leave "Team"?')).toBeTruthy();
        expect(
            screen.getByText("You'll lose access to this space's lists and tasks."),
        ).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

        await waitFor(() => expect(mocks.leaveSpace).toHaveBeenCalledWith({ spaceId: 'sp3' }));
        await waitFor(() => expect(screen.queryByText('Leave "Team"?')).toBeNull());
        expect(cachedIds(queryClient, ['spaces'])).toEqual(['sp1', 'sp2']);
        expect(cachedIds(queryClient, ['lists'])).toEqual(['l1', 'l2']);
        expect(toast.success).toHaveBeenCalledWith('Left space', { id: 'toast-id' });
    });
});
