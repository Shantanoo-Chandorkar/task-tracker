import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setFlag } from '@/providers/UIStateProvider';
import { REORDER_BUSY_MESSAGE } from '@/lib/in-flight-entities';
import TaskList from './TaskList';

const LIST_ID = 'list-1';

const state = vi.hoisted(() => ({
    tasks: [],
    statuses: [],
    sublists: [],
    permission: 'owner',
    filters: { activeCount: 0, matchingTaskIds: [] },
    dndProps: null,
    duplicateTaskById: null,
    taskFormProps: null,
    sublistFormProps: null,
}));

vi.mock('sonner', () => ({
    toast: {
        loading: vi.fn(() => 'toast-id'),
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        dismiss: vi.fn(),
    },
}));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('@/actions/sublist-actions', () => ({ deleteSublist: vi.fn() }));
vi.mock('@/actions/reorder-actions', () => ({ reorderSublists: vi.fn() }));
vi.mock('@/lib/fetch-delete-counts', () => ({ fetchDeleteCounts: async () => null }));

vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('@/hooks/useTasksQuery', () => ({ useTasksQuery: () => ({ data: state.tasks }) }));
vi.mock('@/hooks/useStatusesQuery', () => ({ useStatusesQuery: () => ({ data: state.statuses }) }));
vi.mock('@/hooks/useSublistsQuery', () => ({ useSublistsQuery: () => ({ data: state.sublists }) }));
vi.mock('@/hooks/useSpaceIdForList', () => ({ useSpaceIdForList: () => 'space-1' }));
vi.mock('@/hooks/usePermissionForSpace', () => ({ usePermissionForSpace: () => state.permission }));
vi.mock('@/hooks/useSpaceById', () => ({
    useSpaceById: () => ({ max_subtasks_per_parent: null }),
}));
vi.mock('@/hooks/useDuplicateTask', () => ({
    useDuplicateTask: () => ({ duplicateTaskById: (taskId) => state.duplicateTaskById(taskId) }),
}));
vi.mock('@/hooks/useTaskFilters', () => ({
    useTaskFilters: () => ({ filters: {}, activeCount: state.filters.activeCount }),
}));
vi.mock('@/lib/tasks/task-filters', async (importOriginal) => ({
    ...(await importOriginal()),
    taskMatchesFilters: (task) => state.filters.matchingTaskIds.includes(task.id),
}));

// A real DndContext, wrapped only so the test can call the drag handler the way dnd-kit would
vi.mock('@dnd-kit/core', async () => {
    const actualModule = await vi.importActual('@dnd-kit/core');
    return {
        ...actualModule,
        DndContext: function CapturedDndContext(props) {
            state.dndProps = props;
            return <actualModule.DndContext {...props} />;
        },
    };
});

vi.mock('./TaskRow', () => ({
    default: function TaskRowStub({ task, onMoveTask, siblingTasks }) {
        const neighbour = siblingTasks.find((sibling) => sibling.id !== task.id);
        return (
            <div data-testid={`row-${task.id}`}>
                {task.title}
                <button
                    data-testid={`move-${task.id}`}
                    onClick={() => onMoveTask(task.id, neighbour.id)}
                />
            </div>
        );
    },
    PriorityTierDivider: () => <hr data-testid="tier-divider" />,
}));
vi.mock('./ListHeader', () => ({
    default: ({ children }) => <header data-testid="list-header">{children}</header>,
}));
vi.mock('./TaskFilterBar', () => ({ default: () => null }));
vi.mock('./TaskFilterSheet', () => ({ default: () => null }));
vi.mock('./VelocityMeter', () => ({
    default: ({ completedCount, totalCount }) => (
        <div data-testid="velocity">{`${completedCount}/${totalCount}`}</div>
    ),
}));
vi.mock('@/components/task-form/TaskFormDialog', () => ({
    default: function TaskFormDialogStub(props) {
        state.taskFormProps = props;
        return <div data-testid="task-form" data-open={String(props.open)} />;
    },
    scheduleEditorPrefetch: () => () => {},
}));
vi.mock('@/components/space/SublistFormDialog', () => ({
    default: function SublistFormDialogStub(props) {
        state.sublistFormProps = props;
        return <div data-testid="sublist-form" data-open={String(props.open)} />;
    },
}));
// Menus need pointer events jsdom lacks, so their items render inline
vi.mock('@/components/custom/RowActionsMenu', () => ({
    default: ({ children }) => <div>{children}</div>,
    MoveMenuItems: ({ canMoveUp, canMoveDown, onMoveUp, onMoveDown }) => (
        <>
            <button disabled={!canMoveUp} onClick={onMoveUp}>
                Move up
            </button>
            <button disabled={!canMoveDown} onClick={onMoveDown}>
                Move down
            </button>
        </>
    ),
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
    DropdownMenuItem: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
    DropdownMenuSeparator: () => <hr />,
}));

const { toast } = await import('sonner');
const { bustPageCache } = await import('@/lib/cache/service-worker-cache');
const { deleteSublist } = await import('@/actions/sublist-actions');
const { reorderSublists } = await import('@/actions/reorder-actions');

const STATUSES = [
    { id: 'st-todo', name: 'To do', color: '#111111', code: 'todo', is_default: true },
    { id: 'st-doing', name: 'Doing', color: '#222222', code: 'doing', is_default: false },
    { id: 'st-done', name: 'Done', color: '#333333', code: 'done', is_default: false },
];

function buildTask(id, overrides = {}) {
    return {
        id,
        title: `Task ${id}`,
        list_id: LIST_ID,
        parent_id: null,
        sublist_id: null,
        status_id: 'st-todo',
        is_prioritised: false,
        position: 1,
        depth: 0,
        ...overrides,
    };
}

const SUBLISTS = [
    { id: 's1', name: 'Sprint', color: '#aa0000', position: 0 },
    { id: 's2', name: 'Backlog', color: '#00aa00', position: 1 },
];

function seedStandardList() {
    state.statuses = STATUSES;
    state.sublists = SUBLISTS;
    state.tasks = [
        buildTask('a', { position: 1 }),
        buildTask('b', { position: 2 }),
        buildTask('c', { position: 3 }),
        buildTask('d', { position: 1, status_id: 'st-done' }),
        buildTask('e', { position: 1, sublist_id: 's1' }),
        buildTask('a1', { parent_id: 'a', depth: 1, status_id: 'st-doing' }),
    ];
}

let queryClient;

function renderTaskList() {
    queryClient = new QueryClient();
    // The rows on screen come from this cache entry in the real app
    queryClient.setQueryData(['sublists', LIST_ID], state.sublists);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    return render(
        <QueryClientProvider client={queryClient}>
            <TaskList listId={LIST_ID} currentUserId="user-1" />
        </QueryClientProvider>,
    );
}

function dragTask(activeId, overId) {
    return act(async () => {
        await state.dndProps.onDragEnd({
            active: { id: activeId, data: { current: {} } },
            over: { id: overId },
        });
    });
}

function dragSublist(activeId, overId) {
    return act(async () => {
        await state.dndProps.onDragEnd({
            active: { id: activeId, data: { current: { type: 'sublist' } } },
            over: { id: overId },
        });
    });
}

function cachedTaskIds() {
    return queryClient.getQueryData(['tasks', LIST_ID]).map((task) => task.id);
}

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

beforeEach(() => {
    vi.clearAllMocks();
    state.permission = 'owner';
    state.filters = { activeCount: 0, matchingTaskIds: [] };
    state.duplicateTaskById = vi.fn();
    globalThis.fetch = vi.fn(async () => ({ ok: true }));
    seedStandardList();
    for (const flagKey of [
        'direct:st-todo',
        'direct:st-done:expanded',
        's1:st-todo',
        's1:st-done:expanded',
        'sublist:s1',
    ]) {
        setFlag(flagKey, false);
    }
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('TaskList grouping', () => {
    it('groups root tasks under one heading per status, with the count of each', () => {
        renderTaskList();

        const todoHeading = screen.getAllByRole('heading', { name: /To do/ })[0];
        expect(todoHeading.textContent).toContain('(3)');
        expect(within(todoHeading.closest('section')).getByTestId('row-a')).toBeTruthy();
        expect(screen.getByRole('heading', { name: /Done/ }).textContent).toContain('(1)');
    });

    it('leaves out a status group that has no root tasks, even when subtasks have that status', () => {
        renderTaskList();

        expect(screen.queryByRole('heading', { name: /Doing/ })).toBeNull();
    });

    it('shows a sublist header with its task count and a status breakdown, and its tasks under it', () => {
        renderTaskList();

        const sublistHeading = screen.getByRole('heading', { name: /Sprint/ });
        expect(sublistHeading.textContent).toContain('(1)');
        expect(screen.getByText('1 TO DO')).toBeTruthy();
        expect(screen.getByTestId('row-e')).toBeTruthy();
    });

    it('shows an empty sublist as a header with a zero count and an Add Task link', () => {
        renderTaskList();

        expect(screen.getByRole('heading', { name: /Backlog/ }).textContent).toContain('(0)');
        expect(screen.getAllByRole('button', { name: 'Add Task' }).length).toBeGreaterThan(0);
    });

    it('counts a subtask under its own status in the sublist breakdown', () => {
        state.tasks.push(
            buildTask('e1', { parent_id: 'e', depth: 1, status_id: 'st-doing', sublist_id: null }),
        );

        renderTaskList();

        expect(screen.getByRole('heading', { name: /Sprint/ }).textContent).toContain('(2)');
        expect(screen.getByText(/1 TO DO · 1 DOING|1 DOING · 1 TO DO/)).toBeTruthy();
    });

    it('collapses and expands a status group from its heading', () => {
        renderTaskList();
        const todoToggle = within(screen.getAllByRole('heading', { name: /To do/ })[0]).getByRole(
            'button',
        );

        fireEvent.click(todoToggle);
        expect(screen.queryByTestId('row-a')).toBeNull();
        expect(todoToggle.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(todoToggle);
        expect(screen.getByTestId('row-a')).toBeTruthy();
    });

    it('starts the Done group collapsed, with its count still showing', () => {
        renderTaskList();
        const doneHeading = screen.getByRole('heading', { name: /Done/ });

        expect(within(doneHeading).getByRole('button').getAttribute('aria-expanded')).toBe('false');
        expect(doneHeading.textContent).toContain('(1)');
        expect(screen.queryByTestId('row-d')).toBeNull();
    });

    it('expands the Done group from its heading and collapses it again', () => {
        renderTaskList();
        const doneToggle = within(screen.getByRole('heading', { name: /Done/ })).getByRole(
            'button',
        );

        fireEvent.click(doneToggle);
        expect(screen.getByTestId('row-d')).toBeTruthy();
        expect(doneToggle.getAttribute('aria-expanded')).toBe('true');

        fireEvent.click(doneToggle);
        expect(screen.queryByTestId('row-d')).toBeNull();
    });

    it('leaves every other status group expanded', () => {
        renderTaskList();

        expect(screen.getByTestId('row-a')).toBeTruthy();
        expect(screen.getByTestId('row-b')).toBeTruthy();
        expect(screen.getAllByRole('heading', { name: /To do/ })[0].textContent).toContain('(3)');
    });

    it('keeps the Done group of a sublist apart from the Done group of the main list', () => {
        state.tasks = [...state.tasks, buildTask('f', { sublist_id: 's1', status_id: 'st-done' })];
        renderTaskList();
        expect(screen.queryByTestId('row-d')).toBeNull();
        expect(screen.queryByTestId('row-f')).toBeNull();

        const [mainDoneToggle] = screen
            .getAllByRole('heading', { name: /Done/ })
            .map((doneHeading) => within(doneHeading).getByRole('button'));
        fireEvent.click(mainDoneToggle);

        expect(screen.getByTestId('row-d')).toBeTruthy();
        expect(screen.queryByTestId('row-f')).toBeNull();
    });

    it('collapses a whole sublist from its header', () => {
        renderTaskList();
        const sublistToggle = within(screen.getByRole('heading', { name: /Sprint/ })).getByRole(
            'button',
        );

        fireEvent.click(sublistToggle);

        expect(screen.queryByTestId('row-e')).toBeNull();
    });

    it('passes the completed and total counts to the velocity meter when a done status exists', () => {
        renderTaskList();

        expect(screen.getByTestId('velocity').textContent).toContain('1/6');
    });

    it('hides the velocity meter when the space has no done status', () => {
        state.statuses = STATUSES.filter((status) => status.code !== 'done');

        renderTaskList();

        expect(screen.queryByTestId('velocity')).toBeNull();
    });

    it('draws the priority divider between prioritised and other tasks of a group', () => {
        state.tasks = [buildTask('p', { is_prioritised: true }), buildTask('q', { position: 2 })];
        state.sublists = [];

        renderTaskList();

        expect(screen.getAllByTestId('tier-divider')).toHaveLength(1);
    });
});

describe('TaskList filters', () => {
    it('keeps a root task whose subtask matches, and hides the other roots', () => {
        state.filters = { activeCount: 1, matchingTaskIds: ['a1'] };

        renderTaskList();

        expect(screen.getByTestId('row-a')).toBeTruthy();
        expect(screen.queryByTestId('row-b')).toBeNull();
        expect(screen.queryByTestId('row-d')).toBeNull();
    });

    it('shows a sublist with no matching task as an empty header', () => {
        state.filters = { activeCount: 1, matchingTaskIds: ['a1'] };

        renderTaskList();

        expect(screen.getByRole('heading', { name: /Sprint/ }).textContent).toContain('(0)');
        expect(screen.queryByTestId('row-e')).toBeNull();
    });
});

describe('TaskList empty list', () => {
    beforeEach(() => {
        state.tasks = [];
        state.sublists = [];
    });

    it('shows the empty message and opens the create dialog from New Task', () => {
        renderTaskList();

        expect(screen.getByText(/No tasks yet/)).toBeTruthy();
        expect(screen.getByTestId('task-form').getAttribute('data-open')).toBe('false');

        fireEvent.click(screen.getByRole('button', { name: /New Task/ }));

        expect(screen.getByTestId('task-form').getAttribute('data-open')).toBe('true');
        expect(state.taskFormProps).toMatchObject({ listId: LIST_ID, parentId: null });
    });

    it('offers no New Task button to a read-only collaborator', () => {
        state.permission = 'read_only';

        renderTaskList();

        expect(screen.queryByRole('button', { name: /New Task/ })).toBeNull();
    });
});

describe('TaskList permissions and dialogs', () => {
    it('hides every add control from a read-only collaborator', () => {
        state.permission = 'read_only';

        renderTaskList();

        expect(screen.queryByRole('button', { name: 'Add Task' })).toBeNull();
        expect(screen.queryByRole('button', { name: /Create New Sublist/ })).toBeNull();
    });

    it('opens the task dialog preset to a status when its group Add Task is clicked', () => {
        renderTaskList();
        const todoSection = screen.getAllByRole('heading', { name: /To do/ })[0].closest('section');

        fireEvent.click(within(todoSection).getByRole('button', { name: 'Add Task' }));

        expect(screen.getByTestId('task-form').getAttribute('data-open')).toBe('true');
        expect(state.taskFormProps).toMatchObject({
            defaultStatusId: 'st-todo',
            defaultSublistId: null,
            parentId: null,
        });
    });

    it('opens the task dialog preset to a sublist from the sublist menu', () => {
        renderTaskList();
        const sprintBucket = screen.getByRole('heading', { name: /Sprint/ }).parentElement;

        fireEvent.click(within(sprintBucket).getByRole('button', { name: 'Add task' }));

        expect(state.taskFormProps).toMatchObject({ defaultSublistId: 's1', open: true });
    });

    it('opens the sublist dialog to create and to edit', () => {
        renderTaskList();

        fireEvent.click(screen.getByRole('button', { name: /Create New Sublist/ }));
        expect(state.sublistFormProps).toMatchObject({ open: true, sublist: null });

        const sprintBucket = screen.getByRole('heading', { name: /Sprint/ }).parentElement;
        fireEvent.click(within(sprintBucket).getByRole('button', { name: 'Edit' }));
        expect(state.sublistFormProps).toMatchObject({ open: true, sublist: SUBLISTS[0] });
    });
});

describe('TaskList task reorder', () => {
    it('drops a task onto the first slot: updates the order at once, then saves it', async () => {
        renderTaskList();

        await dragTask('b', 'a');

        expect(cachedTaskIds().slice(0, 3)).toEqual(['b', 'a', 'c']);
        const [moveUrl, moveRequest] = globalThis.fetch.mock.calls[0];
        expect(moveUrl).toBe('/api/tasks/b/move');
        expect(moveRequest.method).toBe('POST');
        expect(JSON.parse(moveRequest.body)).toEqual({
            newParentId: null,
            sublistId: null,
            afterSiblingId: null,
            shouldPrependToStart: true,
            listId: LIST_ID,
        });
    });

    it('drops a task downward: inserts after the target', async () => {
        renderTaskList();

        await dragTask('a', 'c');

        expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toMatchObject({
            afterSiblingId: 'c',
            shouldPrependToStart: false,
        });
        expect(cachedTaskIds().slice(0, 3)).toEqual(['b', 'c', 'a']);
    });

    it('drops a task upward into the middle: inserts after the sibling before the target', async () => {
        renderTaskList();

        await dragTask('c', 'b');

        expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toMatchObject({
            afterSiblingId: 'a',
            shouldPrependToStart: false,
        });
    });

    it('sends a subtask drop with its parent and no sublist', async () => {
        state.tasks.push(buildTask('a2', { parent_id: 'a', depth: 1, position: 2 }));

        renderTaskList();
        await dragTask('a2', 'a1');

        expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toMatchObject({
            newParentId: 'a',
            shouldPrependToStart: true,
        });
        expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).not.toHaveProperty('sublistId');
    });

    it('sends the sublist of a task that sits in one', async () => {
        state.tasks.push(buildTask('e2', { sublist_id: 's1', position: 2 }));

        renderTaskList();
        await dragTask('e2', 'e');

        expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toMatchObject({
            sublistId: 's1',
            newParentId: null,
        });
    });

    it('shows progress, refreshes the list, clears the page cache and confirms on success', async () => {
        renderTaskList();

        await dragTask('b', 'a');

        expect(toast.loading).toHaveBeenCalledWith('Saving order...');
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['tasks', LIST_ID],
        });
        expect(bustPageCache).toHaveBeenCalledWith({ urls: [`/lists/${LIST_ID}`] });
        expect(toast.success).toHaveBeenCalledWith('Order updated', { id: 'toast-id' });
    });

    it('reports a refused save, and reloads the list to undo the optimistic order', async () => {
        globalThis.fetch = vi.fn(async () => ({ ok: false }));
        renderTaskList();

        await dragTask('b', 'a');

        expect(toast.error).toHaveBeenCalledWith('Failed to reorder task', { id: 'toast-id' });
        expect(toast.success).not.toHaveBeenCalled();
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['tasks', LIST_ID],
        });
        expect(bustPageCache).toHaveBeenCalled();
    });

    it('reports a lost connection the same way', async () => {
        globalThis.fetch = vi.fn(async () => {
            throw new Error('offline');
        });
        renderTaskList();

        await dragTask('b', 'a');

        expect(toast.error).toHaveBeenCalledWith('Failed to reorder task', { id: 'toast-id' });
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['tasks', LIST_ID],
        });
    });

    it('ignores a drop onto a task of the other priority tier', async () => {
        state.tasks[1] = buildTask('b', { position: 2, is_prioritised: true });

        renderTaskList();
        await dragTask('a', 'b');

        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(toast.loading).not.toHaveBeenCalled();
    });

    it('ignores a drop onto itself and a drop outside any target', async () => {
        renderTaskList();

        await dragTask('a', 'a');
        await act(async () => {
            await state.dndProps.onDragEnd({
                active: { id: 'a', data: { current: {} } },
                over: null,
            });
        });

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('ignores a drop onto a task that is not a sibling', async () => {
        renderTaskList();

        await dragTask('a', 'e');

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('refuses a second drop while the first is still saving, with the busy message', async () => {
        let finishFirstSave;
        globalThis.fetch = vi.fn(
            () =>
                new Promise((resolve) => {
                    finishFirstSave = () => resolve({ ok: true });
                }),
        );
        renderTaskList();

        let firstDrop;
        act(() => {
            firstDrop = state.dndProps.onDragEnd({
                active: { id: 'b', data: { current: {} } },
                over: { id: 'a' },
            });
        });
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
        await dragTask('c', 'a');

        expect(toast.info).toHaveBeenCalledWith(REORDER_BUSY_MESSAGE);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishFirstSave();
            await firstDrop;
        });
        globalThis.fetch.mockImplementation(async () => ({ ok: true }));
        await dragTask('c', 'a');
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('lets a row move itself next to a neighbour through the same save', async () => {
        renderTaskList();

        await act(async () => {
            fireEvent.click(screen.getByTestId('move-b'));
        });

        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
        expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/tasks/b/move');
        expect(toast.loading).toHaveBeenCalledWith('Saving order...');
    });
});

describe('TaskList sublist reorder', () => {
    it('reorders the sublists at once and saves only the positions that changed', async () => {
        reorderSublists.mockResolvedValue({ error: null });
        renderTaskList();

        await dragSublist('s2', 's1');

        expect(
            queryClient
                .getQueryData(['sublists', LIST_ID])
                .map((cachedSublist) => cachedSublist.id),
        ).toEqual(['s2', 's1']);
        expect(reorderSublists).toHaveBeenCalledWith(LIST_ID, ['s2', 's1']);
        expect(toast.success).toHaveBeenCalledWith('Order updated', { id: 'toast-id' });
        expect(bustPageCache).toHaveBeenCalledWith({ urls: [`/lists/${LIST_ID}`] });
    });

    it('shows the server message when a save is refused, and reloads the sublists', async () => {
        reorderSublists.mockResolvedValue({ error: 'Not allowed' });
        renderTaskList();

        await dragSublist('s2', 's1');

        expect(toast.error).toHaveBeenCalledWith('Not allowed', { id: 'toast-id' });
        expect(toast.success).not.toHaveBeenCalled();
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['sublists', LIST_ID],
        });
    });

    it('reports a lost connection', async () => {
        reorderSublists.mockRejectedValue(new Error('offline'));
        renderTaskList();

        await dragSublist('s2', 's1');

        expect(toast.error).toHaveBeenCalledWith('Failed to reorder sublist', { id: 'toast-id' });
    });

    it('moves a sublist with Move down from its menu', async () => {
        reorderSublists.mockResolvedValue({ error: null });
        renderTaskList();
        const sprintBucket = screen.getByRole('heading', { name: /Sprint/ }).parentElement;

        await act(async () => {
            fireEvent.click(within(sprintBucket).getByRole('button', { name: 'Move down' }));
        });

        await waitFor(() => expect(reorderSublists).toHaveBeenCalledWith(LIST_ID, ['s2', 's1']));
    });

    it('disables Move up on the first sublist', () => {
        renderTaskList();
        const sprintBucket = screen.getByRole('heading', { name: /Sprint/ }).parentElement;

        expect(within(sprintBucket).getByRole('button', { name: 'Move up' }).disabled).toBe(true);
    });
});

describe('TaskList duplicate shortcut', () => {
    function focusRowA() {
        fireEvent.click(screen.getByTestId('row-a'));
    }

    it('duplicates the last clicked task on Ctrl+D', () => {
        renderTaskList();
        focusRowA();

        const wasNotCancelled = fireEvent.keyDown(document.body, { key: 'd', ctrlKey: true });

        expect(state.duplicateTaskById).toHaveBeenCalledWith('a');
        expect(wasNotCancelled).toBe(false);
    });

    it('works with the Cmd key too', () => {
        renderTaskList();
        focusRowA();

        fireEvent.keyDown(document.body, { key: 'd', metaKey: true });

        expect(state.duplicateTaskById).toHaveBeenCalledWith('a');
    });

    it('does nothing before a task has been clicked', () => {
        renderTaskList();

        fireEvent.keyDown(document.body, { key: 'd', ctrlKey: true });

        expect(state.duplicateTaskById).not.toHaveBeenCalled();
    });

    it('ignores D without Ctrl or Cmd', () => {
        renderTaskList();
        focusRowA();

        fireEvent.keyDown(document.body, { key: 'd' });

        expect(state.duplicateTaskById).not.toHaveBeenCalled();
    });

    it('leaves the key to the browser while the user types in a field', () => {
        renderTaskList();
        focusRowA();
        const field = document.createElement('input');
        document.body.appendChild(field);

        const wasNotCancelled = fireEvent.keyDown(field, { key: 'd', ctrlKey: true });

        expect(state.duplicateTaskById).not.toHaveBeenCalled();
        expect(wasNotCancelled).toBe(true);
        field.remove();
    });

    it('swallows a held-down key without duplicating again', () => {
        renderTaskList();
        focusRowA();

        const wasNotCancelled = fireEvent.keyDown(document.body, {
            key: 'd',
            ctrlKey: true,
            repeat: true,
        });

        expect(state.duplicateTaskById).not.toHaveBeenCalled();
        expect(wasNotCancelled).toBe(false);
    });

    it('stops listening once the list is unmounted', () => {
        const { unmount } = renderTaskList();
        focusRowA();
        unmount();

        fireEvent.keyDown(document.body, { key: 'd', ctrlKey: true });

        expect(state.duplicateTaskById).not.toHaveBeenCalled();
    });
});

describe('TaskList delete sublist', () => {
    function openDeletePopup() {
        const sprintBucket = screen.getByRole('heading', { name: /Sprint/ }).parentElement;
        fireEvent.click(within(sprintBucket).getByRole('button', { name: 'Delete' }));
    }

    it('opens a confirmation that says how many tasks go with the sublist', () => {
        renderTaskList();

        openDeletePopup();

        expect(screen.getByText(/Delete .Sprint.\?/)).toBeTruthy();
        expect(
            screen.getByText('This deletes 1 task inside it. This cannot be undone.'),
        ).toBeTruthy();
        expect(deleteSublist).not.toHaveBeenCalled();
    });

    it('closes without deleting on Cancel', async () => {
        renderTaskList();
        openDeletePopup();

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(screen.queryByText(/Delete .Sprint.\?/)).toBeNull());
        expect(deleteSublist).not.toHaveBeenCalled();
    });

    it('stays open and locked while deleting, then closes after both lists reload', async () => {
        let finishDelete;
        deleteSublist.mockReturnValue(
            new Promise((resolve) => {
                finishDelete = () => resolve({ error: null });
            }),
        );
        renderTaskList();
        openDeletePopup();

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(deleteSublist).toHaveBeenCalledWith('s1'));

        expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
        expect(screen.getByText(/Delete .Sprint.\?/)).toBeTruthy();

        await act(async () => {
            finishDelete();
        });

        await waitFor(() => expect(screen.queryByText(/Delete .Sprint.\?/)).toBeNull());
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['sublists', LIST_ID],
        });
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['tasks', LIST_ID],
        });
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['lists'] });
        expect(bustPageCache).toHaveBeenCalledWith({ urls: [`/lists/${LIST_ID}`] });
    });

    it('stays open with the server message when the delete is refused', async () => {
        deleteSublist.mockResolvedValue({ error: 'Cannot delete this sublist' });
        renderTaskList();
        openDeletePopup();

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        expect(await screen.findByText('Cannot delete this sublist')).toBeTruthy();
        expect(screen.getByText(/Delete .Sprint.\?/)).toBeTruthy();
    });

    it('sends one delete when the button is clicked twice', async () => {
        deleteSublist.mockReturnValue(new Promise(() => {}));
        renderTaskList();
        openDeletePopup();
        const confirmButton = screen.getByRole('button', { name: 'Delete' });

        fireEvent.click(confirmButton);
        fireEvent.click(confirmButton);

        await waitFor(() => expect(deleteSublist).toHaveBeenCalled());
        expect(deleteSublist).toHaveBeenCalledTimes(1);
    });
});
