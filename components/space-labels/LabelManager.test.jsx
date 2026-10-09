import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LabelManager from './LabelManager';

const formDialogProps = vi.fn();
vi.mock('./LabelFormDialog', () => ({
    default: (props) => {
        formDialogProps(props);
        return props.open ? (
            <div
                role="dialog"
                aria-label="label form"
            >{`${props.noun}:${props.label?.name ?? 'new'}`}</div>
        ) : null;
    },
}));
vi.mock('sonner', () => ({
    toast: {
        loading: () => 'toast-id',
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        dismiss: vi.fn(),
    },
}));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
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

const TAGS = [
    { id: 't1', name: 'Urgent', color: '#ff0000', position: 0 },
    { id: 't2', name: 'Later', color: '#00ff00', position: 1 },
];

function buildProps(overrides = {}) {
    return {
        spaceId: 'space-1',
        noun: 'Tag',
        resourceKey: 'tags',
        heading: 'Tags',
        description: 'Manage tags.',
        deleteDescription: 'This removes the tag from every task.',
        emptyMessage: 'No tags in this space yet.',
        labels: TAGS,
        isLoading: false,
        actions: {
            create: vi.fn(),
            update: vi.fn(),
            remove: vi.fn().mockResolvedValue({ error: null }),
            saveOrder: vi.fn(),
        },
        onLabelDeleted: vi.fn(),
        ...overrides,
    };
}

function renderManager(props) {
    const queryClient = new QueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            <LabelManager {...props} />
        </QueryClientProvider>,
    );
}

function openRowMenu(labelName) {
    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions for ${labelName}` }), {
        button: 0,
        ctrlKey: false,
    });
}

describe('LabelManager', () => {
    beforeEach(() => vi.clearAllMocks());

    it('shows the heading, the description, every label and the add button named after the kind', () => {
        renderManager(buildProps());

        expect(screen.getByRole('heading', { name: 'Tags' })).toBeTruthy();
        expect(screen.getByText('Manage tags.')).toBeTruthy();
        expect(screen.getByText('Urgent')).toBeTruthy();
        expect(screen.getByText('Later')).toBeTruthy();
        expect(screen.getByRole('button', { name: '+ Add tag' })).toBeTruthy();
    });

    it('shows the loading text, or the empty message, instead of a list', () => {
        const { unmount } = renderManager(buildProps({ isLoading: true }));
        expect(screen.getByText('Loading tags...')).toBeTruthy();
        unmount();

        renderManager(buildProps({ labels: [] }));
        expect(screen.getByText('No tags in this space yet.')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Drag to reorder/ })).toBeNull();
    });

    it('opens the form for a new label, and for an existing one from its menu', async () => {
        renderManager(buildProps());

        fireEvent.click(screen.getByRole('button', { name: '+ Add tag' }));
        expect(screen.getByRole('dialog', { name: 'label form' }).textContent).toBe('Tag:new');

        openRowMenu('Later');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
        expect(screen.getByRole('dialog', { name: 'label form' }).textContent).toBe('Tag:Later');
    });

    it('hides every control that changes labels when read-only, but still lists them', () => {
        renderManager(buildProps({ isReadOnly: true, children: <button>Extra control</button> }));

        expect(screen.getByText('Urgent')).toBeTruthy();
        expect(screen.queryByRole('button', { name: '+ Add tag' })).toBeNull();
        expect(screen.queryByRole('button', { name: /More actions for/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Drag to reorder/ })).toBeNull();
        expect(screen.queryByText('Extra control')).toBeNull();
    });

    it('shows the extra controls under the add button when editable', () => {
        renderManager(buildProps({ children: <button>Extra control</button> }));

        expect(screen.getByText('Extra control')).toBeTruthy();
    });

    it('disables Delete with the reason the kind gives, and offers the plain label otherwise', async () => {
        renderManager(
            buildProps({
                getDeleteBlockedReason: (label) => (label.id === 't1' ? 'Locked tag' : null),
            }),
        );

        openRowMenu('Urgent');
        const blocked = await screen.findByRole('menuitem', { name: 'Locked tag' });
        expect(blocked.getAttribute('aria-disabled')).toBe('true');
        cleanup();

        renderManager(buildProps({ getDeleteBlockedReason: () => null }));
        openRowMenu('Later');
        expect(await screen.findByRole('menuitem', { name: 'Delete' })).toBeTruthy();
    });

    it('deletes only after the confirm, then waits for onLabelDeleted before closing', async () => {
        let finishReload;
        const props = buildProps({
            onLabelDeleted: vi.fn(() => new Promise((resolve) => (finishReload = resolve))),
        });
        renderManager(props);

        openRowMenu('Later');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        expect(props.actions.remove).not.toHaveBeenCalled();
        expect(screen.getByText('This removes the tag from every task.')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(props.actions.remove).toHaveBeenCalledWith('t2'));
        await waitFor(() => expect(props.onLabelDeleted).toHaveBeenCalledWith(TAGS[1]));
        expect(screen.getByText('This removes the tag from every task.')).toBeTruthy();

        await act(async () => finishReload());
        await waitFor(() =>
            expect(screen.queryByText('This removes the tag from every task.')).toBeNull(),
        );
    });

    it('keeps the popup open and shows the message when the delete is refused', async () => {
        const props = buildProps();
        props.actions.remove.mockResolvedValue({ error: 'Not allowed' });
        renderManager(props);

        openRowMenu('Later');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        expect(await screen.findByText('Not allowed')).toBeTruthy();
        expect(props.onLabelDeleted).not.toHaveBeenCalled();
        expect(screen.getByText('This removes the tag from every task.')).toBeTruthy();
    });
});
