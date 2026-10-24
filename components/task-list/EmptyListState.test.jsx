import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import EmptyListState from './EmptyListState';

const LIST_ID = 'list-1';

const state = vi.hoisted(() => ({
    taskFormProps: null,
    sublistFormProps: null,
}));

vi.mock('./ListHeader', () => ({ default: () => <div data-testid="list-header" /> }));

vi.mock('@/components/task-form/TaskFormDialog', () => ({
    default: function TaskFormDialogStub(props) {
        state.taskFormProps = props;
        return null;
    },
}));

vi.mock('@/components/space/SublistFormDialog', () => ({
    default: function SublistFormDialogStub(props) {
        state.sublistFormProps = props;
        return null;
    },
}));

afterEach(() => {
    cleanup();
    state.taskFormProps = null;
    state.sublistFormProps = null;
});

describe('EmptyListState', () => {
    it('renders both New Task and New Sub-list buttons when canWrite', () => {
        render(<EmptyListState listId={LIST_ID} canWrite />);

        expect(screen.getByRole('button', { name: /new task/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /new sub-list/i })).toBeTruthy();
    });

    it('hides both buttons when canWrite is false', () => {
        render(<EmptyListState listId={LIST_ID} canWrite={false} />);

        expect(screen.queryByRole('button', { name: /new task/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /new sub-list/i })).toBeNull();
    });

    it('opens the sublist dialog for this list, in create mode, on click', () => {
        render(<EmptyListState listId={LIST_ID} canWrite />);

        expect(state.sublistFormProps).toMatchObject({
            open: false,
            sublist: null,
            listId: LIST_ID,
        });

        fireEvent.click(screen.getByRole('button', { name: /new sub-list/i }));

        expect(state.sublistFormProps).toMatchObject({
            open: true,
            sublist: null,
            listId: LIST_ID,
        });
    });

    it('opens the task dialog for this list, in create mode, on click', () => {
        render(<EmptyListState listId={LIST_ID} canWrite />);

        fireEvent.click(screen.getByRole('button', { name: /new task/i }));

        expect(state.taskFormProps).toMatchObject({ open: true, parentId: null, listId: LIST_ID });
    });
});
