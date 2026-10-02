import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WebhookEndpointCard from './WebhookEndpointCard';

const deleteWebhookEndpoint = vi.fn();

vi.mock('@/actions/webhook-actions', () => ({
    deleteWebhookEndpoint: (...args) => deleteWebhookEndpoint(...args),
    rotateWebhookSecret: vi.fn(),
    sendWebhookTestEvent: vi.fn(),
    setWebhookEndpointEnabled: vi.fn(),
}));
vi.mock('@/components/webhook/WebhookDeliveryLog', () => ({ default: () => null }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('sonner', () => ({
    toast: { loading: () => 'toast-id', success: vi.fn(), dismiss: vi.fn(), error: vi.fn() },
}));

const endpoint = {
    id: 'endpoint-delete-test',
    space_id: 'space-1',
    name: 'Zapier',
    url: 'https://hooks.example.com/a',
    event_types: ['*'],
    payload_level: 'standard',
    enabled: true,
};

function renderCard() {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['webhook-endpoints', 'space-1'], [endpoint]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const onDeleted = vi.fn();
    render(
        <QueryClientProvider client={queryClient}>
            <WebhookEndpointCard
                endpoint={endpoint}
                onEdit={vi.fn()}
                onSecretRotated={vi.fn()}
                onDeleted={onDeleted}
            />
        </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete webhook' }));
    return { queryClient, onDeleted };
}

// While pending the spinner adds an accessible name, so the label is "LoadingDelete"
const confirmButton = () => screen.getByRole('button', { name: /^(Loading)?Delete$/ });

describe('WebhookEndpointCard delete popup', () => {
    beforeEach(() => vi.clearAllMocks());

    it('stays open and locked while deleting, then removes the row before it closes', async () => {
        let finishDelete;
        deleteWebhookEndpoint.mockReturnValue(new Promise((resolve) => (finishDelete = resolve)));
        const { queryClient, onDeleted } = renderCard();

        fireEvent.click(confirmButton());

        expect(screen.getByText(/Delete .Zapier.\?/)).toBeTruthy();
        expect(confirmButton().disabled).toBe(true);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.getByText(/Delete .Zapier.\?/)).toBeTruthy();
        expect(queryClient.getQueryData(['webhook-endpoints', 'space-1'])).toHaveLength(1);

        await act(async () => finishDelete({ error: null }));

        await waitFor(() =>
            expect(queryClient.getQueryData(['webhook-endpoints', 'space-1'])).toEqual([]),
        );
        expect(onDeleted).toHaveBeenCalledWith('endpoint-delete-test');
    });

    it('stays open with the error and a working button when the server refuses', async () => {
        deleteWebhookEndpoint.mockResolvedValue({ error: 'Only the owner can delete this' });
        const { queryClient } = renderCard();

        fireEvent.click(confirmButton());

        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('owner'));
        expect(screen.getByText(/Delete .Zapier.\?/)).toBeTruthy();
        expect(confirmButton().disabled).toBe(false);
        expect(queryClient.getQueryData(['webhook-endpoints', 'space-1'])).toHaveLength(1);
    });
});
