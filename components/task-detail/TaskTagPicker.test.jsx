import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TaskTagPicker from './TaskTagPicker';

const addTagToTask = vi.fn();
const toastInfo = vi.fn();

vi.mock('@/actions/tag-actions', () => ({
    addTagToTask: (...args) => addTagToTask(...args),
    removeTagFromTask: vi.fn(),
}));
vi.mock('@/hooks/useTagsQuery', () => ({ useTagsQuery: () => ({ data: [] }) }));
vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: (...args) => toastInfo(...args) } }));
// The real combobox is replaced by a button that adds one tag, so the test is about the picker's own guard
vi.mock('@/components/tag/TagComboboxField', () => ({
    default: ({ onAdd }) => <button onClick={() => onAdd('urgent')}>add tag</button>,
}));

describe('TaskTagPicker', () => {
    beforeEach(() => vi.clearAllMocks());

    it('adds one tag at a time and says so when a second add comes in too early', async () => {
        let finishAdd;
        addTagToTask.mockReturnValue(new Promise((resolve) => (finishAdd = resolve)));
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

        expect(addTagToTask).toHaveBeenCalledTimes(1);
        expect(toastInfo).toHaveBeenCalledWith('Still saving the last tag change');

        await act(async () => finishAdd({ error: null }));
    });
});
