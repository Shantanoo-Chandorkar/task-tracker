import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StatusPicker from './StatusPicker';

const statuses = [
    { id: 's-todo', name: 'To do', color: '#111111', is_default: true, code: 'todo' },
    { id: 's-doing', name: 'Doing', color: '#222222', is_default: false, code: null },
    { id: 's-done', name: 'Done', color: '#333333', is_default: false, code: 'done' },
];
const task = { id: 'task-1', list_id: 'list-1', status_id: 's-todo' };

const fetchMock = vi.fn();

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));

// Radix Select measures and scrolls elements, which jsdom does not implement
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => {};
});

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

function renderPicker() {
    const completion = {
        statuses,
        isResolvingStatuses: false,
        doneStatus: statuses[2],
        defaultStatus: statuses[0],
        setComplete: vi.fn(),
    };
    const rendered = render(
        <QueryClientProvider client={new QueryClient()}>
            <StatusPicker task={task} completion={completion} />
        </QueryClientProvider>,
    );
    return { ...rendered, completion };
}

describe('StatusPicker', () => {
    it('shows the current status on a combobox button without building the Radix Select', () => {
        const { container } = renderPicker();

        expect(screen.getByRole('combobox').textContent).toBe('To do');
        expect(container.querySelector('[data-slot="select-trigger"]')).toBeNull();
    });

    it('builds the real Select and opens it on the first click', async () => {
        const { container } = renderPicker();

        fireEvent.click(screen.getByRole('combobox'));

        expect(container.querySelector('[data-slot="select-trigger"]')).not.toBeNull();
        expect(await screen.findByRole('option', { name: 'Doing' })).toBeTruthy();
    });

    it('opens from the keyboard with ArrowDown, as a Select trigger does', async () => {
        renderPicker();

        fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });

        expect(await screen.findByRole('option', { name: 'Doing' })).toBeTruthy();
    });

    it('saves the status the user picks', async () => {
        renderPicker();
        fireEvent.click(screen.getByRole('combobox'));

        fireEvent.click(await screen.findByRole('option', { name: 'Doing' }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        const [requestedUrl, requestOptions] = fetchMock.mock.calls[0];
        expect(requestedUrl).toBe('/api/tasks/task-1');
        expect(JSON.parse(requestOptions.body)).toEqual({ status_id: 's-doing' });
    });

    it('sends a change to or from Done through the shared completion flow instead of a plain save', async () => {
        const { completion } = renderPicker();
        fireEvent.click(screen.getByRole('combobox'));

        fireEvent.click(await screen.findByRole('option', { name: 'Done' }));

        await waitFor(() => expect(completion.setComplete).toHaveBeenCalledTimes(1));
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
