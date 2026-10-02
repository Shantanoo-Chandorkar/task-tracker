import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WebhookDeliveryLog from './WebhookDeliveryLog';

const retryWebhookDelivery = vi.fn();

vi.mock('@/actions/webhook-actions', () => ({
    retryWebhookDelivery: (...args) => retryWebhookDelivery(...args),
}));
vi.mock('@/hooks/useWebhookDeliveriesQuery', () => ({
    useWebhookDeliveriesQuery: () => ({
        data: [
            { id: 'delivery-retry-1', status: 'failed', event_type: 'task.created', attempts: 1 },
            { id: 'delivery-retry-2', status: 'failed', event_type: 'task.updated', attempts: 1 },
        ],
        isLoading: false,
        isError: false,
    }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('WebhookDeliveryLog retry', () => {
    beforeEach(() => vi.clearAllMocks());

    it('retries one delivery once however often it is pressed, while another can retry at the same time', async () => {
        const finishers = [];
        retryWebhookDelivery.mockImplementation(
            () => new Promise((resolve) => finishers.push(resolve)),
        );
        const queryClient = new QueryClient();
        vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
        render(
            <QueryClientProvider client={queryClient}>
                <WebhookDeliveryLog endpointId="endpoint-1" />
            </QueryClientProvider>,
        );
        const retryButtons = screen.getAllByRole('button', { name: /retry/i });

        fireEvent.click(retryButtons[0]);
        fireEvent.click(retryButtons[0]);
        fireEvent.click(retryButtons[1]);
        // The first row is still retrying even though the second one started after it
        fireEvent.click(retryButtons[0]);

        expect(retryWebhookDelivery).toHaveBeenCalledTimes(2);
        expect(retryWebhookDelivery).toHaveBeenNthCalledWith(1, 'delivery-retry-1');
        expect(retryWebhookDelivery).toHaveBeenNthCalledWith(2, 'delivery-retry-2');

        await act(async () => finishers.forEach((finish) => finish({ error: null })));
    });
});
