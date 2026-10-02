import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
const attachMyPermissionLevel = vi.fn();
const attachTaskCounts = vi.fn();
const getCurrentUserProfile = vi.fn();
const fromTable = vi.fn();

vi.mock('react', async (importOriginal) => ({
    ...(await importOriginal()),
    // React's request cache is not active outside a render, so memoise by hand like it does
    cache: (loader) => {
        let pending;
        return (...args) => (pending ??= loader(...args));
    },
}));
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ from: (table) => fromTable(table) }),
}));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/lib/permissions/space-permissions', () => ({
    attachMyPermissionLevel: (...args) => attachMyPermissionLevel(...args),
}));
vi.mock('@/lib/list-task-counts', () => ({
    attachTaskCounts: (...args) => attachTaskCounts(...args),
}));
vi.mock('@/lib/profile', () => ({
    getCurrentUserProfile: (...args) => getCurrentUserProfile(...args),
}));

function queryReturning(rows) {
    return { select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) };
}

describe('app shell data', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        getCurrentUser.mockResolvedValue({ id: 'user-1' });
        fromTable.mockImplementation((table) =>
            queryReturning(table === 'spaces' ? [{ id: 's1' }] : [{ id: 'l1' }]),
        );
        attachMyPermissionLevel.mockResolvedValue([{ id: 's1', my_permission_level: 'owner' }]);
        attachTaskCounts.mockResolvedValue([{ id: 'l1', task_count: 2 }]);
        getCurrentUserProfile.mockResolvedValue({ id: 'user-1', display_name: 'Sam' });
    });

    it('reads spaces and lists only once however many parts ask for them', async () => {
        const { loadSpacesAndLists } = await import('./app-shell-data');

        await Promise.all([loadSpacesAndLists(), loadSpacesAndLists(), loadSpacesAndLists()]);

        expect(fromTable).toHaveBeenCalledTimes(2);
    });

    it('returns spaces with permission, lists with counts, and the profile', async () => {
        const { loadShellData } = await import('./app-shell-data');

        const shellData = await loadShellData();

        expect(shellData.initialSpaces[0].my_permission_level).toBe('owner');
        expect(shellData.initialLists[0].task_count).toBe(2);
        expect(shellData.initialProfile.display_name).toBe('Sam');
    });

    it('starts permissions, counts and profile together instead of one after another', async () => {
        const pendingResolvers = [];
        const pending = () => new Promise((resolve) => pendingResolvers.push(resolve));
        attachMyPermissionLevel.mockImplementation(pending);
        attachTaskCounts.mockImplementation(pending);
        getCurrentUserProfile.mockImplementation(pending);
        const { loadShellData } = await import('./app-shell-data');

        const loading = loadShellData();
        await vi.waitFor(() => expect(pendingResolvers).toHaveLength(3));

        pendingResolvers.forEach((finish) => finish([]));
        await loading;
    });

    it('gives no profile and no permission when nobody is signed in', async () => {
        getCurrentUser.mockResolvedValue(null);
        const { loadShellData } = await import('./app-shell-data');

        await loadShellData();

        expect(getCurrentUserProfile).not.toHaveBeenCalled();
        expect(attachMyPermissionLevel).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            null,
        );
    });
});
