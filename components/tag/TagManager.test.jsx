import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import TagManager from './TagManager';

const TAGS = [
    { id: 't1', name: 'Urgent', color: '#ff0000', position: 0 },
    { id: 't2', name: 'Later', color: '#00ff00', position: 1 },
];

const tagsQuery = vi.hoisted(() => ({ data: [], isLoading: false }));
const permission = vi.hoisted(() => ({ level: 'owner' }));
const deleteTag = vi.fn();
const deleteAllTagsInSpace = vi.fn();
const reorderTags = vi.fn();

vi.mock('@/hooks/useTagsQuery', () => ({ useTagsQuery: () => tagsQuery }));
vi.mock('@/hooks/usePermissionForSpace', () => ({ usePermissionForSpace: () => permission.level }));
vi.mock('@/actions/tag-actions', () => ({
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: (...args) => deleteTag(...args),
    deleteAllTagsInSpace: (...args) => deleteAllTagsInSpace(...args),
}));
vi.mock('@/actions/reorder-actions', () => ({ reorderTags: (...args) => reorderTags(...args) }));
vi.mock('@/components/space-labels/LabelFormDialog', () => ({ default: () => null }));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('sonner', () => ({
    toast: {
        loading: () => 'toast-id',
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        dismiss: vi.fn(),
    },
}));

// Radix positions the menu with a ResizeObserver, which jsdom does not provide
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

afterEach(cleanup);

let queryClient;

function renderManager() {
    queryClient = new QueryClient();
    queryClient.setQueryData(['tags', 'space-1'], TAGS);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    return render(
        <QueryClientProvider client={queryClient}>
            <TagManager spaceId="space-1" />
        </QueryClientProvider>,
    );
}

function openRowMenu(tagName) {
    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions for ${tagName}` }), {
        button: 0,
        ctrlKey: false,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    tagsQuery.data = TAGS;
    tagsQuery.isLoading = false;
    permission.level = 'owner';
});

describe('TagManager', () => {
    it('lists the tags with an add button and a delete-all button', () => {
        renderManager();

        expect(screen.getByText('Urgent')).toBeTruthy();
        expect(screen.getByText('Later')).toBeTruthy();
        expect(screen.getByRole('button', { name: '+ Add tag' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Delete all tags in this space' })).toBeTruthy();
    });

    it('disables delete-all when the space has no tags', () => {
        tagsQuery.data = [];
        renderManager();

        expect(screen.getByText('No tags in this space yet.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Delete all tags in this space' }).disabled).toBe(
            true,
        );
    });

    it('removes a deleted tag from the cache before it reloads, and closes the popup', async () => {
        deleteTag.mockResolvedValue({ error: null });
        renderManager();

        openRowMenu('Later');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(deleteTag).toHaveBeenCalledWith('t2'));
        await waitFor(() =>
            expect(queryClient.getQueryData(['tags', 'space-1']).map((tag) => tag.id)).toEqual([
                't1',
            ]),
        );
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['tags', 'space-1'],
        });
    });

    it('asks before deleting every tag, then empties the cache and says how many went', async () => {
        deleteAllTagsInSpace.mockResolvedValue({ count: 2, error: null, code: null });
        renderManager();

        fireEvent.click(screen.getByRole('button', { name: 'Delete all tags in this space' }));
        expect(
            screen.getByText(
                'This removes all 2 tags from every task in this space. This cannot be undone.',
            ),
        ).toBeTruthy();
        expect(deleteAllTagsInSpace).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));

        await waitFor(() => expect(deleteAllTagsInSpace).toHaveBeenCalledWith('space-1'));
        await waitFor(() => expect(queryClient.getQueryData(['tags', 'space-1'])).toEqual([]));
        expect(toast.success).toHaveBeenCalledWith('Deleted 2 tags', { id: 'toast-id' });
    });

    it('keeps the delete-all popup open with the message when it is refused', async () => {
        deleteAllTagsInSpace.mockResolvedValue({
            count: 0,
            error: 'Read-only collaborators cannot create new items',
            code: 'PERMISSION_READ_ONLY',
        });
        renderManager();

        fireEvent.click(screen.getByRole('button', { name: 'Delete all tags in this space' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));

        expect(
            await screen.findByText('Read-only collaborators cannot create new items'),
        ).toBeTruthy();
        expect(queryClient.getQueryData(['tags', 'space-1'])).toEqual(TAGS);
    });

    it('saves a new order through reorderTags for the space', async () => {
        reorderTags.mockResolvedValue({ error: null });
        renderManager();

        openRowMenu('Later');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));

        await waitFor(() => expect(reorderTags).toHaveBeenCalledWith('space-1', ['t2', 't1']));
    });

    it('shows the tags and nothing that changes them to a read-only collaborator', () => {
        permission.level = 'read_only';
        renderManager();

        expect(screen.getByText('Urgent')).toBeTruthy();
        expect(screen.queryByRole('button', { name: '+ Add tag' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Delete all tags in this space' })).toBeNull();
        expect(screen.queryByRole('button', { name: /More actions for/ })).toBeNull();
    });
});
