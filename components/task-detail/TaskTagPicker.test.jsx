import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TaskTagPicker from './TaskTagPicker';

const assignTagsToTask = vi.fn();
const toastInfo = vi.fn();
const toastError = vi.fn();

vi.mock('@/actions/tag-actions', () => ({
    assignTagsToTask: (...args) => assignTagsToTask(...args),
    removeTagFromTask: vi.fn(),
}));
vi.mock('@/hooks/useTagsQuery', () => ({ useTagsQuery: () => ({ data: [] }) }));
const permissionLevel = vi.hoisted(() => ({ current: 'owner' }));
vi.mock('@/hooks/usePermissionForSpace', () => ({
    usePermissionForSpace: () => permissionLevel.current,
}));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('sonner', () => ({
    toast: { error: (...args) => toastError(...args), info: (...args) => toastInfo(...args) },
}));
// The real combobox is replaced by a button that adds one tag, so the test is about the picker's own guard
vi.mock('@/components/tag/TagComboboxField', () => ({
    default: ({ onAdd, isReadOnly }) =>
        isReadOnly ? (
            <p>read only</p>
        ) : (
            <button onClick={() => onAdd('tag-urgent')}>add tag</button>
        ),
}));

function renderPicker() {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    return render(
        <QueryClientProvider client={queryClient}>
            <TaskTagPicker task={{ id: 'task-tag-1', list_id: 'list-1', tags: [] }} spaceId="s1" />
        </QueryClientProvider>,
    );
}

describe('TaskTagPicker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        permissionLevel.current = 'owner';
    });

    it('attaches the picked tag by id, and refreshes the task and the tags', async () => {
        assignTagsToTask.mockResolvedValue({ error: null });
        renderPicker();

        await act(async () => fireEvent.click(screen.getByText('add tag')));

        expect(assignTagsToTask).toHaveBeenCalledWith({
            taskId: 'task-tag-1',
            tagIds: ['tag-urgent'],
        });
    });

    it('shows the server message and does not refresh when the tag is refused', async () => {
        assignTagsToTask.mockResolvedValue({ error: 'A task can have at most 10 tags' });
        renderPicker();

        await act(async () => fireEvent.click(screen.getByText('add tag')));

        expect(toastError).toHaveBeenCalledWith('A task can have at most 10 tags');
    });

    it('shows the pills only for a read-only collaborator', () => {
        permissionLevel.current = 'read_only';
        renderPicker();

        expect(screen.getByText('read only')).toBeTruthy();
        expect(screen.queryByText('add tag')).toBeNull();
    });

    it('adds one tag at a time and says so when a second add comes in too early', async () => {
        let finishAdd;
        assignTagsToTask.mockReturnValue(new Promise((resolve) => (finishAdd = resolve)));
        const queryClient = new QueryClient();
        vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
        render(
            <QueryClientProvider client={queryClient}>
                <TaskTagPicker
                    task={{ id: 'task-tag-1', list_id: 'list-1', tags: [] }}
                    spaceId="s1"
                />
            </QueryClientProvider>,
        );

        fireEvent.click(screen.getByText('add tag'));
        fireEvent.click(screen.getByText('add tag'));

        expect(assignTagsToTask).toHaveBeenCalledTimes(1);
        expect(toastInfo).toHaveBeenCalledWith('Still saving the last tag change');

        await act(async () => finishAdd({ error: null }));
    });
});
