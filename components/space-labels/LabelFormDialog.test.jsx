import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LabelFormDialog from './LabelFormDialog';

vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));

// Radix needs a ResizeObserver, which jsdom does not provide
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

afterEach(cleanup);

let queryClient;
let create;
let update;
let onClose;

/** Mounts the dialog closed and then opens it, as the manager does, because the form fills in when it opens. */
function renderDialog(overrides = {}) {
    queryClient = new QueryClient();
    queryClient.setQueryData(['tags', 'space-1'], [{ id: 't0', name: 'Old', color: '#111111' }]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const buildDialog = (props) => (
        <QueryClientProvider client={queryClient}>
            <LabelFormDialog
                onClose={onClose}
                noun="Tag"
                spaceId="space-1"
                resourceKey="tags"
                create={create}
                update={update}
                {...props}
            />
        </QueryClientProvider>
    );
    const rendered = render(buildDialog({ open: false }));
    rendered.rerender(buildDialog({ open: true, ...overrides }));
    return rendered;
}

beforeEach(() => {
    create = vi.fn();
    update = vi.fn();
    onClose = vi.fn();
});

describe('LabelFormDialog', () => {
    it('names the title, the field and the button after the kind of label', () => {
        renderDialog();

        expect(screen.getByRole('dialog', { name: 'New Tag' })).toBeTruthy();
        expect(screen.getByPlaceholderText('Tag name')).toBeTruthy();
        const createButton = screen.getByRole('button', { name: 'Create tag' });
        expect(createButton.disabled).toBe(true);
    });

    it('creates with the name, the colour, the space and a client id, then adds the row and closes', async () => {
        create.mockResolvedValue({
            data: { id: 't1', name: 'Urgent', color: '#6b7280', space_id: 'space-1' },
            error: null,
        });
        renderDialog();

        fireEvent.change(screen.getByPlaceholderText('Tag name'), {
            target: { value: ' Urgent ' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create tag' }));

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        expect(create).toHaveBeenCalledWith({
            id: expect.stringMatching(/^[0-9a-f-]{36}$/),
            name: 'Urgent',
            color: '#6b7280',
            space_id: 'space-1',
        });
        expect(queryClient.getQueryData(['tags', 'space-1']).map((row) => row.id)).toEqual([
            't0',
            't1',
        ]);
    });

    it('edits the label it was opened on, and says Edit in the title', async () => {
        update.mockResolvedValue({
            data: { id: 't0', name: 'Renamed', color: '#111111', space_id: 'space-1' },
            error: null,
        });
        renderDialog({ noun: 'Status', label: { id: 't0', name: 'Old', color: '#111111' } });

        expect(screen.getByRole('dialog', { name: 'Edit Status' })).toBeTruthy();
        fireEvent.change(screen.getByPlaceholderText('Status name'), {
            target: { value: 'Renamed' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        expect(update).toHaveBeenCalledWith('t0', {
            name: 'Renamed',
            color: '#111111',
            space_id: 'space-1',
        });
        expect(create).not.toHaveBeenCalled();
    });

    it('stays open with the message and keeps what was typed when the save is refused', async () => {
        create.mockResolvedValue({ data: null, error: 'A tag with that name already exists' });
        renderDialog();

        fireEvent.change(screen.getByPlaceholderText('Tag name'), { target: { value: 'Urgent' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create tag' }));

        expect(await screen.findByText('A tag with that name already exists')).toBeTruthy();
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByPlaceholderText('Tag name').value).toBe('Urgent');
        expect(screen.getByRole('button', { name: 'Create tag' }).disabled).toBe(false);
    });
});
