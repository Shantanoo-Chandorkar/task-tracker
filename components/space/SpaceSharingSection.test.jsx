import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SpaceSharingSection from './SpaceSharingSection';

const approveJoinRequest = vi.fn();

vi.mock('@/actions/collaboration-actions', () => ({
    approveJoinRequest: (...args) => approveJoinRequest(...args),
    rejectJoinRequest: vi.fn(),
    removeCollaborator: vi.fn(),
    updateCollaboratorPermission: vi.fn(),
}));
vi.mock('@/actions/invite-actions', () => ({
    sendSpaceInvite: vi.fn(),
    revokeSpaceInvite: vi.fn(),
}));
vi.mock('@/hooks/useJoinRequestsQuery', () => ({
    useJoinRequestsQuery: () => ({
        data: [{ id: 'request-approve-1', requester_email: 'new@example.com' }],
        isLoading: false,
    }),
}));
vi.mock('@/hooks/useCollaboratorsQuery', () => ({
    useCollaboratorsQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/usePendingInvitesQuery', () => ({
    usePendingInvitesQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('sonner', () => ({
    toast: { loading: () => 'toast-id', success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

function renderSharingSection() {
    const queryClient = new QueryClient();
    let finishReload;
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(
        () => new Promise((resolve) => (finishReload = resolve)),
    );
    render(
        <QueryClientProvider client={queryClient}>
            <SpaceSharingSection space={{ id: 'space-1', name: 'Home' }} />
        </QueryClientProvider>,
    );
    return { finishReload: () => finishReload() };
}

const approveButton = () => screen.getByRole('button', { name: 'Approve request' });

describe('SpaceSharingSection approve', () => {
    beforeEach(() => vi.clearAllMocks());

    it('approves once however often it is pressed, and stays locked until the lists reload', async () => {
        approveJoinRequest.mockResolvedValue({ error: null });
        const { finishReload } = renderSharingSection();

        fireEvent.click(approveButton());
        fireEvent.click(approveButton());
        await act(async () => {});

        expect(approveJoinRequest).toHaveBeenCalledTimes(1);
        expect(approveButton().disabled).toBe(true);

        await act(async () => finishReload());
    });

    it('unlocks and shows the error when the server refuses', async () => {
        approveJoinRequest.mockResolvedValue({ error: 'Request no longer exists' });
        renderSharingSection();

        fireEvent.click(approveButton());
        await act(async () => {});

        expect(approveButton().disabled).toBe(false);
    });
});
