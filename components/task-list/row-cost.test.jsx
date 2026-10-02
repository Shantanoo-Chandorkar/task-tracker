import { appendFileSync } from 'node:fs';
import { useCallback, useMemo, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SortableContext } from '@dnd-kit/sortable';
import TaskRow from './TaskRow';
import { useTasksQuery } from '@/hooks/useTasksQuery';
import { createStableIdsReader, createStableTreeBuilder } from '@/lib/tree';

const LIST_ID = 'list-1';
const SPACE_ID = 'space-1';
const ROW_COUNT = 100;

const mountCountsByComponentName = vi.hoisted(() => ({}));
const renderCountsByRowId = vi.hoisted(() => ({}));

function countMounts(componentName) {
    mountCountsByComponentName[componentName] =
        (mountCountsByComponentName[componentName] ?? 0) + 1;
}

vi.mock('next/link', () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({
    toast: { loading: () => 'toast-id', success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/actions/task-actions', () => ({
    deleteTask: vi.fn(),
    deleteTaskAndReparentChildren: vi.fn(),
    updateTask: vi.fn(),
    completeTaskAndDescendants: vi.fn(),
    uncompleteTaskAndDescendants: vi.fn(),
}));
vi.mock('@/lib/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
// A row calls useSortable on every render, so counting its calls counts the row's real renders
vi.mock('@dnd-kit/sortable', async () => {
    const actualModule = await vi.importActual('@dnd-kit/sortable');
    return {
        ...actualModule,
        useSortable: (sortableOptions) => {
            renderCountsByRowId[sortableOptions.id] =
                (renderCountsByRowId[sortableOptions.id] ?? 0) + 1;
            return actualModule.useSortable(sortableOptions);
        },
    };
});

// Wrapped, not stubbed: the real dialogs bring their own query observers, which is part of the cost
function countingDialogMock(componentName, importActualModule) {
    return async () => {
        const { useEffect } = await import('react');
        const actualModule = await importActualModule();
        const ActualDialog = actualModule.default;
        return {
            default: function CountedDialog(props) {
                useEffect(() => countMounts(componentName), []);
                return <ActualDialog {...props} />;
            },
        };
    };
}

vi.mock(
    '@/components/task-form/TaskFormDialog',
    countingDialogMock('TaskFormDialog', () =>
        vi.importActual('@/components/task-form/TaskFormDialog'),
    ),
);
vi.mock(
    '@/components/task-list/CompleteTaskDialog',
    countingDialogMock('CompleteTaskDialog', () =>
        vi.importActual('@/components/task-list/CompleteTaskDialog'),
    ),
);
vi.mock(
    '@/components/task-list/DeleteTaskDialog',
    countingDialogMock('DeleteTaskDialog', () =>
        vi.importActual('@/components/task-list/DeleteTaskDialog'),
    ),
);

// Radix positions menus with a ResizeObserver, which jsdom does not provide
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

afterEach(() => {
    cleanup();
    for (const componentName of Object.keys(mountCountsByComponentName))
        delete mountCountsByComponentName[componentName];
});

function makeTasks() {
    return Array.from({ length: ROW_COUNT }, (_unused, rowIndex) => ({
        id: `t${rowIndex}`,
        title: `Task ${rowIndex}`,
        list_id: LIST_ID,
        parent_id: null,
        sublist_id: null,
        status_id: 'st-todo',
        position: rowIndex,
        is_prioritised: false,
        tags: [],
        created_by: 'user-1',
    }));
}

function makeQueryClient() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    queryClient.setQueryData(['tasks', LIST_ID], makeTasks());
    queryClient.setQueryData(['lists'], [{ id: LIST_ID, space_id: SPACE_ID, name: 'List' }]);
    queryClient.setQueryData(
        ['spaces'],
        [{ id: SPACE_ID, name: 'Space', max_subtasks_per_parent: null }],
    );
    queryClient.setQueryData(
        ['statuses', SPACE_ID],
        [
            { id: 'st-todo', name: 'To do', color: '#111111', is_default: true, code: 'todo' },
            { id: 'st-done', name: 'Done', color: '#222222', is_default: false, code: 'done' },
        ],
    );
    queryClient.setQueryData(['sublists', LIST_ID], []);
    return queryClient;
}

// Mirrors how TaskList feeds rows: one shared task query, a tree built from it, one row per root task
function RowListHarness() {
    const { data: flatList = [] } = useTasksQuery(LIST_ID);
    const [buildStableTree] = useState(createStableTreeBuilder);
    const rootTasks = useMemo(() => buildStableTree(flatList), [buildStableTree, flatList]);
    const [readStableIds] = useState(createStableIdsReader);
    const rootTaskIds = readStableIds(rootTasks);
    const onMoveTask = useCallback(() => {}, []);

    return (
        <SortableContext items={rootTaskIds}>
            {rootTasks.map((rootTask) => (
                <TaskRow
                    key={rootTask.id}
                    task={rootTask}
                    depth={0}
                    listId={LIST_ID}
                    currentUserId="user-1"
                    myPermission="owner"
                    maxSubtasksPerParent={null}
                    siblingTasks={rootTasks}
                    onMoveTask={onMoveTask}
                />
            ))}
        </SortableContext>
    );
}

function countObserversOn(queryClient, queryKeyPrefix) {
    return queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => query.queryKey[0] === queryKeyPrefix)
        .reduce((total, query) => total + query.getObserversCount(), 0);
}

describe('row render cost', () => {
    it('keeps a long list cheap to mount and to edit', async () => {
        const queryClient = makeQueryClient();

        const mountStartedAt = performance.now();
        render(
            <QueryClientProvider client={queryClient}>
                <RowListHarness />
            </QueryClientProvider>,
        );
        const mountMilliseconds = performance.now() - mountStartedAt;

        for (const rowId of Object.keys(renderCountsByRowId)) delete renderCountsByRowId[rowId];

        const updateStartedAt = performance.now();
        await act(async () => {
            queryClient.setQueryData(['tasks', LIST_ID], (currentTasks) =>
                currentTasks.map((task) =>
                    task.id === 't5' ? { ...task, title: 'Edited' } : task,
                ),
            );
            // TanStack batches its notifications on a timer, so let it fire before React is asked to settle
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
        const updateMilliseconds = performance.now() - updateStartedAt;

        const metrics = {
            rows: ROW_COUNT,
            mountMilliseconds: Math.round(mountMilliseconds),
            updateMilliseconds: Math.round(updateMilliseconds),
            rowsRenderedAfterOneEdit: Object.keys(renderCountsByRowId).length,
            statusObservers: countObserversOn(queryClient, 'statuses'),
            listObservers: countObserversOn(queryClient, 'lists'),
            sublistObservers: countObserversOn(queryClient, 'sublists'),
            spaceObservers: countObserversOn(queryClient, 'spaces'),
            ...mountCountsByComponentName,
        };
        if (process.env.ROW_COST_OUT)
            appendFileSync(
                process.env.ROW_COST_OUT,
                `${JSON.stringify(metrics)}
`,
            );

        // Only the edited row re-renders; the other rows are skipped by memo
        expect(metrics.rowsRenderedAfterOneEdit).toBe(1);
        // Dialogs are built when first opened, so a list of rows builds none
        expect(mountCountsByComponentName.TaskFormDialog ?? 0).toBe(0);
        expect(mountCountsByComponentName.DeleteTaskDialog ?? 0).toBe(0);
        // At most the one completion hook per row watches statuses and lists; sublists and spaces not at all
        expect(metrics.statusObservers).toBeLessThanOrEqual(ROW_COUNT);
        expect(metrics.listObservers).toBeLessThanOrEqual(ROW_COUNT);
        expect(metrics.sublistObservers).toBe(0);
        expect(metrics.spaceObservers).toBe(0);
    }, 120000);
});
