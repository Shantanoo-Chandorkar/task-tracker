import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TaskRowActions from './TaskRowActions';

const LIST_ID = 'list-1';

vi.mock('sonner', () => ({
    toast: { loading: () => 'toast-id', success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/actions/task-actions', () => ({
    deleteTask: vi.fn(),
    deleteTaskAndReparentChildren: vi.fn(),
    updateTask: vi.fn(),
}));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));

// Radix positions menus with a ResizeObserver, which jsdom does not provide
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

afterEach(cleanup);

const parentTask = { id: 'parent', title: 'Parent', parent_id: null, sublist_id: null, depth: 0 };
const otherRoot = { id: 'other', title: 'Other root', parent_id: null, sublist_id: null, depth: 0 };
const childTask = {
    id: 'child',
    title: 'Child',
    parent_id: 'parent',
    sublist_id: null,
    depth: 1,
    created_by: 'user-1',
};

function renderActions(task, flatList) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    queryClient.setQueryData(['sublists', LIST_ID], []);
    queryClient.setQueryData(['tasks', LIST_ID], flatList);
    const completion = {
        doneStatus: { id: 's-done' },
        defaultStatus: { id: 's-todo' },
        isDone: () => false,
        setComplete: vi.fn(),
    };
    render(
        <QueryClientProvider client={queryClient}>
            <TaskRowActions
                task={task}
                completion={completion}
                onAddSubtask={vi.fn()}
                listId={LIST_ID}
                currentUserId="user-1"
                myPermission="owner"
            />
        </QueryClientProvider>,
    );
    return queryClient;
}

function openMenu(task) {
    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions for ${task.title}` }), {
        button: 0,
        ctrlKey: false,
    });
}

function countSublistObservers(queryClient) {
    return queryClient
        .getQueryCache()
        .findAll({ queryKey: ['sublists'] })
        .reduce((total, query) => total + query.getObserversCount(), 0);
}

describe('TaskRowActions Move to', () => {
    it('does not look at sublists or move targets until the menu is opened', () => {
        const queryClient = renderActions(childTask, [parentTask, otherRoot, childTask]);

        expect(countSublistObservers(queryClient)).toBe(0);
    });

    it('offers Move to... when the task has somewhere to go', async () => {
        renderActions(childTask, [parentTask, otherRoot, childTask]);
        openMenu(childTask);

        expect(await screen.findByRole('menuitem', { name: 'Move to...' })).toBeTruthy();
    });

    it('leaves Move to... out when the task has nowhere to go', async () => {
        renderActions(otherRoot, [otherRoot]);
        openMenu(otherRoot);

        await screen.findByRole('menuitem', { name: 'Edit' });
        expect(screen.queryByRole('menuitem', { name: 'Move to...' })).toBeNull();
    });

    it('opens the destination sheet listing the other tasks', async () => {
        renderActions(childTask, [parentTask, otherRoot, childTask]);
        openMenu(childTask);

        fireEvent.click(await screen.findByRole('menuitem', { name: 'Move to...' }));

        expect(await screen.findByText('Other root')).toBeTruthy();
    });
});
