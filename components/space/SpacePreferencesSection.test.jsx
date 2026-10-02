import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SpacePreferencesSection from './SpacePreferencesSection';

const updateSpace = vi.fn();

vi.mock('@/actions/space-actions', () => ({ updateSpace: (...args) => updateSpace(...args) }));
vi.mock('@/hooks/useSpaceById', () => ({
    useSpaceById: () => ({ id: 'space-1', require_due_date: false, max_subtasks_per_parent: 5 }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// jsdom lacks ResizeObserver, which the Radix checkbox needs
vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

const capCheckbox = () => screen.getByRole('checkbox', { name: /limit direct subtasks/i });

describe('SpacePreferencesSection subtask limit', () => {
    beforeEach(() => vi.clearAllMocks());

    it('puts the box back to the saved state when the save is refused', async () => {
        updateSpace.mockResolvedValue({ error: 'Only the owner can change this' });
        render(
            <QueryClientProvider client={new QueryClient()}>
                <SpacePreferencesSection spaceId="space-1" isOwner />
            </QueryClientProvider>,
        );
        expect(capCheckbox().getAttribute('aria-checked')).toBe('true');

        fireEvent.click(capCheckbox());

        await waitFor(() => expect(updateSpace).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(capCheckbox().getAttribute('aria-checked')).toBe('true'));
    });

    it('puts the box back when the request cannot reach the server', async () => {
        updateSpace.mockRejectedValue(new Error('offline'));
        render(
            <QueryClientProvider client={new QueryClient()}>
                <SpacePreferencesSection spaceId="space-1" isOwner />
            </QueryClientProvider>,
        );

        fireEvent.click(capCheckbox());

        await waitFor(() => expect(updateSpace).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(capCheckbox().getAttribute('aria-checked')).toBe('true'));
    });
});
