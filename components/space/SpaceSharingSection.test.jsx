import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { toast } from 'sonner';
import SpaceSharingSection from './SpaceSharingSection';

const mocks = vi.hoisted(() => ({
    requests: [],
    collaborators: [],
    invites: [],
    isLoadingRequests: false,
    isLoadingCollaborators: false,
    isLoadingInvites: false,
    approveJoinRequest: vi.fn(),
    rejectJoinRequest: vi.fn(),
    removeCollaborator: vi.fn(),
    updateCollaboratorPermission: vi.fn(),
    sendSpaceInvite: vi.fn(),
    revokeSpaceInvite: vi.fn(),
}));

vi.mock('@/actions/collaboration-actions', () => ({
    approveJoinRequest: (...args) => mocks.approveJoinRequest(...args),
    rejectJoinRequest: (...args) => mocks.rejectJoinRequest(...args),
    removeCollaborator: (...args) => mocks.removeCollaborator(...args),
    updateCollaboratorPermission: (...args) => mocks.updateCollaboratorPermission(...args),
}));
vi.mock('@/actions/invite-actions', () => ({
    sendSpaceInvite: (...args) => mocks.sendSpaceInvite(...args),
    revokeSpaceInvite: (...args) => mocks.revokeSpaceInvite(...args),
}));
vi.mock('@/hooks/useJoinRequestsQuery', () => ({
    useJoinRequestsQuery: () => ({
        data: mocks.requests,
        isLoading: mocks.isLoadingRequests,
    }),
}));
vi.mock('@/hooks/useCollaboratorsQuery', () => ({
    useCollaboratorsQuery: () => ({
        data: mocks.collaborators,
        isLoading: mocks.isLoadingCollaborators,
    }),
}));
vi.mock('@/hooks/usePendingInvitesQuery', () => ({
    usePendingInvitesQuery: () => ({ data: mocks.invites, isLoading: mocks.isLoadingInvites }),
}));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('sonner', () => ({
    toast: {
        loading: vi.fn(() => 'toast-id'),
        success: vi.fn(),
        error: vi.fn(),
        dismiss: vi.fn(),
    },
}));
// Radix Select needs pointer APIs jsdom lacks, so a plain stand-in keeps the same props contract.
vi.mock('@/components/ui/select', () => {
    const SelectContext = createContext({});
    return {
        Select: ({ value, onValueChange, disabled, children }) => (
            <SelectContext.Provider value={{ value, onValueChange, disabled }}>
                {children}
            </SelectContext.Provider>
        ),
        SelectTrigger: ({ 'aria-label': label }) => {
            const { value, disabled } = useContext(SelectContext);
            return (
                <button type="button" aria-label={label} disabled={disabled}>
                    {value}
                </button>
            );
        },
        SelectValue: () => null,
        SelectContent: ({ children }) => <div>{children}</div>,
        SelectItem: ({ value, children }) => {
            const { onValueChange } = useContext(SelectContext);
            return (
                <button type="button" onClick={() => onValueChange(value)}>
                    {`level:${children}`}
                </button>
            );
        },
    };
});

// Each test gets its own ids, because the in-flight guards are module level and outlive a test.
let runNumber = 0;
let joinRequest;
let collaborator;
let pendingInvite;

function buildFixtures() {
    runNumber += 1;
    joinRequest = { id: `request-${runNumber}`, requester_email: 'new@example.com' };
    collaborator = {
        id: `collab-${runNumber}`,
        requester_email: 'friend@example.com',
        permission_level: 'full',
    };
    pendingInvite = {
        id: `invite-${runNumber}`,
        invited_email: 'invited@example.com',
        expires_at: '2030-01-04T00:00:00.000Z',
    };
}

function pendingPromise() {
    let resolve;
    const promise = new Promise((resolvePromise) => (resolve = resolvePromise));
    return { promise, resolve };
}

function renderSharingSection({ holdReload = true } = {}) {
    const queryClient = new QueryClient();
    let finishReload = () => {};
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(() =>
        holdReload ? new Promise((resolve) => (finishReload = resolve)) : Promise.resolve(),
    );
    render(
        <QueryClientProvider client={queryClient}>
            <SpaceSharingSection space={{ id: 'space-1', name: 'Home' }} />
        </QueryClientProvider>,
    );
    return { queryClient, finishReload: () => finishReload() };
}

beforeEach(() => {
    vi.clearAllMocks();
    buildFixtures();
    mocks.requests = [joinRequest];
    mocks.collaborators = [];
    mocks.invites = [];
    mocks.isLoadingRequests = false;
    mocks.isLoadingCollaborators = false;
    mocks.isLoadingInvites = false;
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

const approveButton = () => screen.getByRole('button', { name: 'Approve request' });

describe('SpaceSharingSection approve', () => {
    it('approves once however often it is pressed, and stays locked until the lists reload', async () => {
        mocks.approveJoinRequest.mockResolvedValue({ error: null });
        const { finishReload } = renderSharingSection();

        fireEvent.click(approveButton());
        fireEvent.click(approveButton());
        await act(async () => {});

        expect(mocks.approveJoinRequest).toHaveBeenCalledTimes(1);
        expect(mocks.approveJoinRequest).toHaveBeenCalledWith({ requestId: joinRequest.id });
        expect(approveButton().disabled).toBe(true);

        await act(async () => finishReload());
        await act(async () => finishReload());
    });

    it('unlocks and shows the error when the server refuses', async () => {
        mocks.approveJoinRequest.mockResolvedValue({ error: 'Request no longer exists' });
        renderSharingSection();

        fireEvent.click(approveButton());
        await act(async () => {});

        expect(approveButton().disabled).toBe(false);
        expect(toast.error).toHaveBeenCalledWith('Request no longer exists', { id: 'toast-id' });
    });

    it('unlocks and says the server was unreachable when the call throws', async () => {
        mocks.approveJoinRequest.mockRejectedValue(new Error('offline'));
        renderSharingSection();

        fireEvent.click(approveButton());
        await act(async () => {});

        expect(approveButton().disabled).toBe(false);
        expect(toast.error).toHaveBeenCalledWith('Could not reach the server. Try again.', {
            id: 'toast-id',
        });
    });

    it('confirms with a toast and reloads both people lists', async () => {
        mocks.approveJoinRequest.mockResolvedValue({ error: null });
        const { queryClient, finishReload } = renderSharingSection();

        fireEvent.click(approveButton());
        await act(async () => {});

        expect(toast.success).toHaveBeenCalledWith('Request approved', { id: 'toast-id' });
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['space-collaborators', 'space-1'],
        });
        await act(async () => finishReload());
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['space-invites', 'space-1'],
        });
        await act(async () => finishReload());
    });
});

describe('SpaceSharingSection confirm popups', () => {
    it('rejects a request only after a confirm, and closes once the server says yes', async () => {
        mocks.rejectJoinRequest.mockResolvedValue({ error: null });
        renderSharingSection({ holdReload: false });

        fireEvent.click(screen.getByRole('button', { name: 'Reject request' }));
        expect(await screen.findByText('Reject request from "new@example.com"?')).toBeTruthy();
        expect(screen.getByText("They'll need to send a new request to join.")).toBeTruthy();
        expect(mocks.rejectJoinRequest).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

        await waitFor(() =>
            expect(mocks.rejectJoinRequest).toHaveBeenCalledWith({ requestId: joinRequest.id }),
        );
        await waitFor(() =>
            expect(screen.queryByText('Reject request from "new@example.com"?')).toBeNull(),
        );
        expect(toast.success).toHaveBeenCalledWith('Request rejected', { id: 'toast-id' });
    });

    it('removes a collaborator after a confirm and drops the row from the cache at once', async () => {
        mocks.requests = [];
        mocks.collaborators = [collaborator];
        const pendingRemove = pendingPromise();
        mocks.removeCollaborator.mockReturnValue(pendingRemove.promise);
        const { queryClient } = renderSharingSection({ holdReload: false });
        queryClient.setQueryData(['space-collaborators', 'space-1'], [collaborator]);

        fireEvent.click(screen.getByRole('button', { name: 'Remove collaborator' }));
        expect(
            await screen.findByText('Remove "friend@example.com" from this space?'),
        ).toBeTruthy();
        expect(
            screen.getByText("They'll lose access to this space's lists and tasks."),
        ).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

        await waitFor(() =>
            expect(mocks.removeCollaborator).toHaveBeenCalledWith({
                collaboratorId: collaborator.id,
            }),
        );
        expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true);

        await act(async () => pendingRemove.resolve({ error: null }));

        await waitFor(() =>
            expect(screen.queryByText('Remove "friend@example.com" from this space?')).toBeNull(),
        );
        expect(queryClient.getQueryData(['space-collaborators', 'space-1'])).toEqual([]);
        expect(toast.success).toHaveBeenCalledWith('Collaborator removed', { id: 'toast-id' });
    });

    it('revokes an invite after a confirm', async () => {
        mocks.requests = [];
        mocks.invites = [pendingInvite];
        mocks.revokeSpaceInvite.mockResolvedValue({ error: null });
        renderSharingSection({ holdReload: false });

        fireEvent.click(screen.getByRole('button', { name: 'Revoke invite' }));
        expect(
            await screen.findByText('Revoke the invite sent to "invited@example.com"?'),
        ).toBeTruthy();
        expect(screen.getByText('The link in their email will stop working.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

        await waitFor(() =>
            expect(mocks.revokeSpaceInvite).toHaveBeenCalledWith({ inviteId: pendingInvite.id }),
        );
        expect(toast.success).toHaveBeenCalledWith('Invite revoked', { id: 'toast-id' });
    });

    it('stays open with the server message when the action is refused', async () => {
        mocks.rejectJoinRequest.mockResolvedValue({ error: 'Request not found' });
        renderSharingSection({ holdReload: false });
        fireEvent.click(screen.getByRole('button', { name: 'Reject request' }));
        await screen.findByText('Reject request from "new@example.com"?');

        fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

        expect(await screen.findByText('Request not found')).toBeTruthy();
        expect(screen.getByText('Reject request from "new@example.com"?')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Reject' }).disabled).toBe(false);
    });

    it('closes with Cancel without calling the server', async () => {
        renderSharingSection({ holdReload: false });
        fireEvent.click(screen.getByRole('button', { name: 'Reject request' }));
        await screen.findByText('Reject request from "new@example.com"?');

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() =>
            expect(screen.queryByText('Reject request from "new@example.com"?')).toBeNull(),
        );
        expect(mocks.rejectJoinRequest).not.toHaveBeenCalled();
    });
});

describe('SpaceSharingSection permission change', () => {
    beforeEach(() => {
        mocks.requests = [];
        mocks.collaborators = [collaborator];
    });

    const permissionTrigger = () =>
        screen.getByRole('button', { name: 'Permission for friend@example.com' });

    it('saves the chosen level and shows it at once in the cache', async () => {
        mocks.updateCollaboratorPermission.mockResolvedValue({ error: null });
        const { queryClient } = renderSharingSection({ holdReload: false });
        queryClient.setQueryData(['space-collaborators', 'space-1'], [collaborator]);

        fireEvent.click(screen.getByRole('button', { name: 'level:Read-only' }));
        await act(async () => {});

        expect(mocks.updateCollaboratorPermission).toHaveBeenCalledWith({
            collaboratorId: collaborator.id,
            permissionLevel: 'read_only',
        });
        expect(toast.success).toHaveBeenCalledWith('Permission updated', { id: 'toast-id' });
        expect(queryClient.getQueryData(['space-collaborators', 'space-1'])).toEqual([
            { ...collaborator, permission_level: 'read_only' },
        ]);
    });

    it('locks that row while saving', async () => {
        const pendingSave = pendingPromise();
        mocks.updateCollaboratorPermission.mockReturnValue(pendingSave.promise);
        renderSharingSection({ holdReload: false });

        fireEvent.click(screen.getByRole('button', { name: 'level:Read-only' }));
        await act(async () => {});

        expect(permissionTrigger().disabled).toBe(true);
        await act(async () => pendingSave.resolve({ error: null }));
        expect(permissionTrigger().disabled).toBe(false);
    });

    it('leaves the cache alone and shows the error when the server refuses', async () => {
        mocks.updateCollaboratorPermission.mockResolvedValue({ error: 'Not allowed' });
        const { queryClient } = renderSharingSection({ holdReload: false });
        queryClient.setQueryData(['space-collaborators', 'space-1'], [collaborator]);

        fireEvent.click(screen.getByRole('button', { name: 'level:Read-only' }));
        await act(async () => {});

        expect(toast.error).toHaveBeenCalledWith('Not allowed', { id: 'toast-id' });
        expect(queryClient.getQueryData(['space-collaborators', 'space-1'])).toEqual([
            collaborator,
        ]);
        expect(permissionTrigger().disabled).toBe(false);
    });

    it('says the server was unreachable when the call throws', async () => {
        mocks.updateCollaboratorPermission.mockRejectedValue(new Error('offline'));
        renderSharingSection({ holdReload: false });

        fireEvent.click(screen.getByRole('button', { name: 'level:Read-only' }));
        await act(async () => {});

        expect(toast.error).toHaveBeenCalledWith('Could not reach the server. Try again.', {
            id: 'toast-id',
        });
    });
});

describe('SpaceSharingSection invite by email', () => {
    const emailInput = () => screen.getByLabelText('Invite by email');
    const sendButton = () => screen.getByRole('button', { name: 'Send' });

    beforeEach(() => {
        mocks.requests = [];
    });

    it('keeps Send disabled until an email is typed', () => {
        renderSharingSection({ holdReload: false });

        expect(sendButton().disabled).toBe(true);
        fireEvent.change(emailInput(), { target: { value: ' a@b.co ' } });
        expect(sendButton().disabled).toBe(false);
    });

    it('sends the trimmed email, clears the field, confirms and reloads', async () => {
        mocks.sendSpaceInvite.mockResolvedValue({ error: null });
        const { queryClient } = renderSharingSection({ holdReload: false });
        fireEvent.change(emailInput(), { target: { value: ' a@b.co ' } });

        fireEvent.submit(emailInput().closest('form'));
        await act(async () => {});

        expect(mocks.sendSpaceInvite).toHaveBeenCalledWith({
            spaceId: 'space-1',
            email: 'a@b.co',
        });
        expect(emailInput().value).toBe('');
        expect(toast.success).toHaveBeenCalledWith('Invite sent');
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['space-invites', 'space-1'],
        });
    });

    it('sends once however often it is submitted, and locks the field meanwhile', async () => {
        const pendingSend = pendingPromise();
        mocks.sendSpaceInvite.mockReturnValue(pendingSend.promise);
        renderSharingSection({ holdReload: false });
        fireEvent.change(emailInput(), { target: { value: 'a@b.co' } });

        fireEvent.submit(emailInput().closest('form'));
        fireEvent.submit(emailInput().closest('form'));
        await act(async () => {});

        expect(mocks.sendSpaceInvite).toHaveBeenCalledTimes(1);
        expect(emailInput().disabled).toBe(true);
        await act(async () => pendingSend.resolve({ error: null }));
    });

    it('shows the server error under the field and keeps the email', async () => {
        mocks.sendSpaceInvite.mockResolvedValue({ error: 'Already invited' });
        renderSharingSection({ holdReload: false });
        fireEvent.change(emailInput(), { target: { value: 'a@b.co' } });

        fireEvent.submit(emailInput().closest('form'));
        await act(async () => {});

        expect(screen.getByText('Already invited')).toBeTruthy();
        expect(emailInput().value).toBe('a@b.co');
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('clears the error as soon as the email changes', async () => {
        mocks.sendSpaceInvite.mockResolvedValue({ error: 'Already invited' });
        renderSharingSection({ holdReload: false });
        fireEvent.change(emailInput(), { target: { value: 'a@b.co' } });
        fireEvent.submit(emailInput().closest('form'));
        await act(async () => {});

        fireEvent.change(emailInput(), { target: { value: 'c@d.co' } });

        expect(screen.queryByText('Already invited')).toBeNull();
    });

    it('says the server was unreachable when the call throws, and unlocks the field', async () => {
        mocks.sendSpaceInvite.mockRejectedValue(new Error('offline'));
        renderSharingSection({ holdReload: false });
        fireEvent.change(emailInput(), { target: { value: 'a@b.co' } });

        fireEvent.submit(emailInput().closest('form'));
        await act(async () => {});

        expect(screen.getByText('Could not reach the server. Try again.')).toBeTruthy();
        expect(emailInput().disabled).toBe(false);
    });
});

describe('SpaceSharingSection copy buttons', () => {
    let writeText;

    beforeEach(() => {
        mocks.requests = [];
        writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    });

    it('copies the space id', async () => {
        renderSharingSection({ holdReload: false });

        fireEvent.click(screen.getByRole('button', { name: 'Copy space ID' }));
        await act(async () => {});

        expect(writeText).toHaveBeenCalledWith('space-1');
        expect(toast.success).toHaveBeenCalledWith('Space ID copied');
    });

    it('copies the join link', async () => {
        renderSharingSection({ holdReload: false });

        fireEvent.click(screen.getByRole('button', { name: 'Copy join link' }));
        await act(async () => {});

        expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/spaces?join=space-1`);
        expect(toast.success).toHaveBeenCalledWith('Join link copied');
    });

    it('says the copy failed when the clipboard refuses', async () => {
        writeText.mockRejectedValue(new Error('denied'));
        renderSharingSection({ holdReload: false });

        fireEvent.click(screen.getByRole('button', { name: 'Copy join link' }));
        await act(async () => {});

        expect(toast.error).toHaveBeenCalledWith('Could not copy join link');
    });
});

describe('SpaceSharingSection lists', () => {
    it('shows nothing for empty groups', () => {
        mocks.requests = [];
        renderSharingSection({ holdReload: false });

        expect(screen.queryByText('Pending invites')).toBeNull();
        expect(screen.queryByText('Pending requests')).toBeNull();
        expect(screen.queryByText('Collaborators')).toBeNull();
    });

    it('shows each group with its rows', () => {
        mocks.collaborators = [collaborator];
        mocks.invites = [pendingInvite];
        renderSharingSection({ holdReload: false });

        expect(screen.getByText('Pending invites')).toBeTruthy();
        expect(screen.getByText('invited@example.com')).toBeTruthy();
        expect(screen.getByText('Pending requests')).toBeTruthy();
        expect(screen.getByText('new@example.com')).toBeTruthy();
        expect(screen.getByText('Collaborators')).toBeTruthy();
        expect(screen.getByText('friend@example.com')).toBeTruthy();
    });

    it('shows a loading line and hides the group that is still loading', () => {
        mocks.isLoadingRequests = true;
        mocks.collaborators = [collaborator];
        renderSharingSection({ holdReload: false });

        expect(screen.getByText('Loading invites, requests and collaborators...')).toBeTruthy();
        expect(screen.queryByText('Pending requests')).toBeNull();
        expect(screen.getByText('Collaborators')).toBeTruthy();
    });

    it.each([
        ['2030-01-04T00:00:00.000Z', 'Expires in 3 days'],
        ['2030-01-02T00:00:00.000Z', 'Expires in 1 day'],
        ['2029-12-31T00:00:00.000Z', 'Expired'],
    ])('labels an invite expiring at %s as "%s"', (expiresAt, label) => {
        vi.useFakeTimers({ now: new Date('2030-01-01T00:00:00.000Z') });
        mocks.requests = [];
        mocks.invites = [{ ...pendingInvite, expires_at: expiresAt }];
        renderSharingSection({ holdReload: false });

        expect(screen.getByText(label)).toBeTruthy();
    });
});
