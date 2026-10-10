import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTaskEditConflict } from './useTaskEditConflict';

const OPENED_TASK = { id: 't1', title: 'Mine', status_id: 'todo', updated_at: 'stamp-1' };
const CURRENT_TASK = { id: 't1', title: 'Theirs', status_id: 'todo', updated_at: 'stamp-2' };

function renderConflictHook() {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
        ['tasks', 'list-1'],
        [
            { ...OPENED_TASK, tags: [{ id: 'tag-1' }] },
            { id: 't2', title: 'Other' },
        ],
    );
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result: hookResult } = renderHook(() => useTaskEditConflict(), { wrapper });
    return { hookResult, queryClient };
}

describe('useTaskEditConflict', () => {
    it('has no version until editing starts', () => {
        const { hookResult } = renderConflictHook();

        expect(hookResult.current.expectedUpdatedAt).toBeUndefined();
    });

    it('fixes the version of the task the dialog opened on', () => {
        const { hookResult } = renderConflictHook();

        act(() => hookResult.current.startEditing(OPENED_TASK));

        expect(hookResult.current.expectedUpdatedAt).toBe('stamp-1');
    });

    it('has no version for a task without updated_at, or for create mode', () => {
        const { hookResult } = renderConflictHook();

        act(() => hookResult.current.startEditing({ id: 't1' }));
        expect(hookResult.current.expectedUpdatedAt).toBeUndefined();

        act(() => hookResult.current.startEditing(null));
        expect(hookResult.current.expectedUpdatedAt).toBeUndefined();
    });

    it('names what changed, moves the version to the stored task and patches the list cache', () => {
        const { hookResult, queryClient } = renderConflictHook();
        act(() => hookResult.current.startEditing(OPENED_TASK));

        let message;
        act(() => {
            message = hookResult.current.resolveConflict({
                currentTask: CURRENT_TASK,
                taskListId: 'list-1',
                statuses: [],
            });
        });

        expect(message).toContain('Title');
        expect(hookResult.current.expectedUpdatedAt).toBe('stamp-2');
        const [patchedTask] = queryClient.getQueryData(['tasks', 'list-1']);
        expect(patchedTask).toMatchObject({ title: 'Theirs', updated_at: 'stamp-2' });
        expect(patchedTask.tags).toEqual([{ id: 'tag-1' }]);
    });

    it('compares a second conflict against the first stored task, not the original', () => {
        const { hookResult } = renderConflictHook();
        act(() => hookResult.current.startEditing(OPENED_TASK));
        act(() => {
            hookResult.current.resolveConflict({
                currentTask: CURRENT_TASK,
                taskListId: 'list-1',
                statuses: [],
            });
        });

        let message;
        act(() => {
            message = hookResult.current.resolveConflict({
                currentTask: { ...CURRENT_TASK, status_id: 'done', updated_at: 'stamp-3' },
                taskListId: 'list-1',
                statuses: [],
            });
        });

        expect(message).toContain('Status');
        expect(message).not.toContain('Title');
    });
});
