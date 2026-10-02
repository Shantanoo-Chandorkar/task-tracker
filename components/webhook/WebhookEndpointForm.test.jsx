import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WebhookEndpointForm from './WebhookEndpointForm';

const createWebhookEndpoint = vi.fn();

vi.mock('@/actions/webhook-actions', () => ({
    createWebhookEndpoint: (...args) => createWebhookEndpoint(...args),
    updateWebhookEndpoint: vi.fn(),
}));
// jsdom lacks ResizeObserver, which the Radix checkbox needs
vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function fillAndSubmit(form) {
    fireEvent.change(screen.getByPlaceholderText('https://hooks.example.com/...'), {
        target: { value: 'https://hooks.example.com/a' },
    });
    fireEvent.submit(form);
}

describe('WebhookEndpointForm', () => {
    beforeEach(() => vi.clearAllMocks());

    it('stays locked and creates once until the parent finishes refreshing', async () => {
        createWebhookEndpoint.mockResolvedValue({ data: { secret: 's' }, error: null });
        let finishParentRefresh;
        const onSaved = vi.fn(() => new Promise((resolve) => (finishParentRefresh = resolve)));
        render(<WebhookEndpointForm spaceId="space-1" onSaved={onSaved} onCancel={vi.fn()} />);
        const form = screen.getByRole('form', { name: 'Add webhook' });

        fillAndSubmit(form);
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        fireEvent.submit(form);

        expect(screen.getByRole('button', { name: /create webhook/i }).disabled).toBe(true);
        expect(createWebhookEndpoint).toHaveBeenCalledTimes(1);

        finishParentRefresh();
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /create webhook/i }).disabled).toBe(false),
        );
    });
});
