import { describe, expect, it } from 'vitest';
import { applyTaskReorder, planTaskReorder } from './task-reorder';

function task(id, overrides = {}) {
    return { id, parent_id: null, sublist_id: null, is_prioritised: false, ...overrides };
}

const flatList = [
    task('a'),
    task('b'),
    task('c'),
    task('e', { sublist_id: 's1' }),
    task('f', { sublist_id: 's1' }),
    task('a1', { parent_id: 'a' }),
    task('a2', { parent_id: 'a' }),
];

describe('planTaskReorder', () => {
    it('drops onto the first sibling: lands at the start, with nothing before it', () => {
        expect(planTaskReorder(flatList, 'b', 'a')).toMatchObject({
            reorderedSiblingIds: ['b', 'a', 'c'],
            afterSiblingId: null,
            isMovingToStart: true,
        });
    });

    it('drops downward: lands after the target', () => {
        expect(planTaskReorder(flatList, 'a', 'c')).toMatchObject({
            reorderedSiblingIds: ['b', 'c', 'a'],
            afterSiblingId: 'c',
            isMovingToStart: false,
        });
    });

    it('drops upward into the middle: lands after the sibling before the target', () => {
        expect(planTaskReorder(flatList, 'c', 'b')).toMatchObject({
            reorderedSiblingIds: ['a', 'c', 'b'],
            afterSiblingId: 'a',
            isMovingToStart: false,
        });
    });

    it('returns the dragged task, so the caller can send its parent and sublist', () => {
        expect(planTaskReorder(flatList, 'e', 'f').activeTask).toBe(flatList[3]);
    });

    it('treats subtasks of one parent as one sibling group', () => {
        expect(planTaskReorder(flatList, 'a2', 'a1').reorderedSiblingIds).toEqual(['a2', 'a1']);
    });

    it('keeps each sublist its own sibling group', () => {
        expect(planTaskReorder(flatList, 'e', 'f').reorderedSiblingIds).toEqual(['f', 'e']);
    });

    it('treats a missing sublist and a null sublist as the same group', () => {
        const list = [{ id: 'x', parent_id: null }, task('y')];

        expect(planTaskReorder(list, 'y', 'x').reorderedSiblingIds).toEqual(['y', 'x']);
    });

    it.each([
        ['an unknown dragged task', 'nope', 'a'],
        ['an unknown target', 'a', 'nope'],
        ['a target in another sublist', 'a', 'e'],
        ['a target under another parent', 'a', 'a1'],
    ])('ignores a drop with %s', (label, activeId, overId) => {
        expect(planTaskReorder(flatList, activeId, overId)).toBeNull();
    });

    it('ignores a drop onto a task of the other priority tier', () => {
        const list = [task('a', { is_prioritised: true }), task('b')];

        expect(planTaskReorder(list, 'b', 'a')).toBeNull();
    });

    it('allows a drop within the prioritised tier', () => {
        const list = [task('a', { is_prioritised: true }), task('b', { is_prioritised: true })];

        expect(planTaskReorder(list, 'b', 'a')).not.toBeNull();
    });

    it('treats a missing priority flag as not prioritised', () => {
        const list = [{ id: 'a', parent_id: null }, task('b')];

        expect(planTaskReorder(list, 'b', 'a')).not.toBeNull();
    });
});

describe('applyTaskReorder', () => {
    it('refills the siblings slots in the new order and leaves other tasks where they are', () => {
        const plan = planTaskReorder(flatList, 'c', 'a');

        const reordered = applyTaskReorder(flatList, plan.activeTask, plan.reorderedSiblingIds);

        expect(reordered.map((reorderedTask) => reorderedTask.id)).toEqual([
            'c',
            'a',
            'b',
            'e',
            'f',
            'a1',
            'a2',
        ]);
    });

    it('does not change the input list', () => {
        const before = flatList.map((flatTask) => flatTask.id);

        applyTaskReorder(flatList, flatList[0], ['c', 'b', 'a']);

        expect(flatList.map((flatTask) => flatTask.id)).toEqual(before);
    });

    it('works on a newer list than the one the plan was made from', () => {
        const newerList = [task('c'), task('b'), task('a'), task('z', { sublist_id: 's9' })];

        const reordered = applyTaskReorder(newerList, task('a'), ['a', 'b', 'c']);

        expect(reordered.map((reorderedTask) => reorderedTask.id)).toEqual(['a', 'b', 'c', 'z']);
    });
});
