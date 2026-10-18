import { describe, expect, it } from 'vitest';
import { findIncompleteDescendants, findCompletedDescendants } from './task-completion';

const DONE_STATUS_ID = 'done';

// Two roots; the first has a child that has a grandchild
const flatTaskList = [
    { id: 'root', parent_id: null, depth: 0, status_id: 'todo' },
    { id: 'child', parent_id: 'root', depth: 1, status_id: DONE_STATUS_ID },
    { id: 'grandchild', parent_id: 'child', depth: 2, status_id: 'todo' },
    { id: 'otherRoot', parent_id: null, depth: 0, status_id: 'todo' },
];

describe('findIncompleteDescendants / findCompletedDescendants', () => {
    it('splits descendants by done status', () => {
        expect(
            findIncompleteDescendants('root', flatTaskList, DONE_STATUS_ID).map((task) => task.id),
        ).toEqual(['grandchild']);
        expect(
            findCompletedDescendants('root', flatTaskList, DONE_STATUS_ID).map((task) => task.id),
        ).toEqual(['child']);
    });

    it('never counts the task itself or unrelated tasks', () => {
        expect(findIncompleteDescendants('otherRoot', flatTaskList, DONE_STATUS_ID)).toEqual([]);
        expect(findCompletedDescendants('otherRoot', flatTaskList, DONE_STATUS_ID)).toEqual([]);
    });

    it('returns nothing for an unknown task id', () => {
        expect(findIncompleteDescendants('missing', flatTaskList, DONE_STATUS_ID)).toEqual([]);
        expect(findCompletedDescendants('missing', flatTaskList, DONE_STATUS_ID)).toEqual([]);
    });
});
