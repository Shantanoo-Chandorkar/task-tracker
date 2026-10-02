import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WebhookSettingsSection from './WebhookSettingsSection';

let endpoints;

vi.mock('@/hooks/useWebhookEndpointsQuery', () => ({
    useWebhookEndpointsQuery: () => ({
        data: endpoints,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
    }),
}));

// The card and form are replaced by buttons that fire the callbacks the section hands them
vi.mock('@/components/webhook/WebhookEndpointCard', () => ({
    default: ({ endpoint, onSecretRotated, onDeleted }) => (
        <div>
            <button onClick={() => onSecretRotated('whsec_rotated')}>rotate {endpoint.id}</button>
            <button onClick={() => onDeleted(endpoint.id)}>delete {endpoint.id}</button>
        </div>
    ),
}));
vi.mock('@/components/webhook/WebhookEndpointForm', () => ({
    default: ({ onSaved }) => (
        <button onClick={() => onSaved({ secret: 'whsec_new', endpointId: 'endpoint-1' })}>
            save new webhook
        </button>
    ),
}));

function renderSection() {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    return render(
        <QueryClientProvider client={queryClient}>
            <WebhookSettingsSection spaceId="space-1" />
        </QueryClientProvider>,
    );
}

describe('WebhookSettingsSection signing secret card', () => {
    beforeEach(() => {
        endpoints = [];
    });

    it('removes the secret card when the webhook it belongs to is deleted', async () => {
        endpoints = [{ id: 'endpoint-1' }];
        renderSection();
        fireEvent.click(screen.getByText('rotate endpoint-1'));
        expect(screen.getByLabelText('Signing secret')).toBeTruthy();

        fireEvent.click(screen.getByText('delete endpoint-1'));

        await waitFor(() => expect(screen.queryByLabelText('Signing secret')).toBeNull());
    });

    it('keeps the secret card when a different webhook is deleted', () => {
        endpoints = [{ id: 'endpoint-1' }, { id: 'endpoint-2' }];
        renderSection();
        fireEvent.click(screen.getByText('rotate endpoint-1'));

        fireEvent.click(screen.getByText('delete endpoint-2'));

        expect(screen.getByLabelText('Signing secret')).toBeTruthy();
    });

    it('shows the secret of a webhook that was just created', async () => {
        renderSection();
        fireEvent.click(screen.getByText('Add webhook'));

        fireEvent.click(screen.getByText('save new webhook'));

        await waitFor(() => expect(screen.getByLabelText('Signing secret')).toBeTruthy());
    });
});
