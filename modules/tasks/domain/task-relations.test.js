import { describe, expect, it } from 'vitest';
import {
    buildDescendantIdsByTaskId,
    findAncestors,
    findDescendantIds,
    deepCloneSubtree,
    countSublistTasks,
    snapshotMaxRelativeDepth,
} from './task-relations';

const DONE_STATUS_ID = 'done';

// Two roots; the first has a child that has a grandchild
const flatTaskList = [
    { id: 'root', parent_id: null, depth: 0, status_id: 'todo' },
    { id: 'child', parent_id: 'root', depth: 1, status_id: DONE_STATUS_ID },
    { id: 'grandchild', parent_id: 'child', depth: 2, status_id: 'todo' },
    { id: 'otherRoot', parent_id: null, depth: 0, status_id: 'todo' },
];

describe('findAncestors', () => {
    it('returns ancestors closest first', () => {
        expect(findAncestors('grandchild', flatTaskList).map((task) => task.id)).toEqual([
            'child',
            'root',
        ]);
    });

    it('returns an empty array for a root task', () => {
        expect(findAncestors('root', flatTaskList)).toEqual([]);
    });

    it('returns an empty array for an unknown task id', () => {
        expect(findAncestors('missing', flatTaskList)).toEqual([]);
    });

    it('stops at a missing parent instead of throwing', () => {
        const brokenChain = [{ id: 'a', parent_id: 'gone' }];
        expect(findAncestors('a', brokenChain)).toEqual([]);
    });
});

describe('findDescendantIds', () => {
    it('collects descendants at every depth and excludes the task itself', () => {
        expect(findDescendantIds('root', flatTaskList)).toEqual(new Set(['child', 'grandchild']));
    });

    it('returns an empty set for a leaf', () => {
        expect(findDescendantIds('grandchild', flatTaskList).size).toBe(0);
    });

    it('returns an empty set for an unknown task id', () => {
        expect(findDescendantIds('missing', flatTaskList).size).toBe(0);
    });
});

describe('countSublistTasks', () => {
    const sublistTasks = [
        { id: 'root', parent_id: null, sublist_id: 'sub1' },
        { id: 'child', parent_id: 'root', sublist_id: null },
        { id: 'grandchild', parent_id: 'child', sublist_id: null },
        { id: 'otherRoot', parent_id: null, sublist_id: 'sub1' },
        { id: 'unrelatedRoot', parent_id: null, sublist_id: 'sub2' },
    ];

    it('counts root tasks plus every nested descendant', () => {
        expect(countSublistTasks('sub1', sublistTasks)).toBe(4);
    });

    it('ignores tasks belonging to a different sublist', () => {
        expect(countSublistTasks('sub2', sublistTasks)).toBe(1);
    });

    it('returns 0 for a sublist with no tasks', () => {
        expect(countSublistTasks('empty', sublistTasks)).toBe(0);
    });
});

describe('deepCloneSubtree', () => {
    it('returns null for an unknown task id', () => {
        expect(deepCloneSubtree('missing', flatTaskList)).toBeNull();
    });

    it('clones the task with its nested descendants and no siblings', () => {
        const clonedSubtree = deepCloneSubtree('root', flatTaskList);
        expect(clonedSubtree.id).toBe('root');
        expect(clonedSubtree.children[0].children[0].id).toBe('grandchild');
        expect(clonedSubtree.children).toHaveLength(1);
    });

    it('does not mutate the input tasks', () => {
        deepCloneSubtree('root', flatTaskList);
        expect(flatTaskList[0]).not.toHaveProperty('children');
    });
});

describe('buildDescendantIdsByTaskId', () => {
    it('gives every task the same descendants as findDescendantIds', () => {
        const descendantIdsByTaskId = buildDescendantIdsByTaskId(flatTaskList);

        for (const task of flatTaskList) {
            expect(descendantIdsByTaskId.get(task.id)).toEqual(
                findDescendantIds(task.id, flatTaskList),
            );
        }
    });

    it('maps a task without children to an empty set', () => {
        expect(buildDescendantIdsByTaskId(flatTaskList).get('grandchild').size).toBe(0);
    });

    it('includes grandchildren under their grandparent', () => {
        expect([...buildDescendantIdsByTaskId(flatTaskList).get('root')].sort()).toEqual([
            'child',
            'grandchild',
        ]);
    });

    it('treats a task whose parent is missing as having no ancestors, without failing', () => {
        const descendantIdsByTaskId = buildDescendantIdsByTaskId([
            { id: 'orphan', parent_id: 'gone' },
        ]);

        expect(descendantIdsByTaskId.get('orphan').size).toBe(0);
    });
});

describe('snapshotMaxRelativeDepth', () => {
    it('is 0 for a task with no children', () => {
        expect(snapshotMaxRelativeDepth({ id: 'a' })).toBe(0);
        expect(snapshotMaxRelativeDepth({ id: 'a', children: [] })).toBe(0);
    });

    it('counts the deepest branch only', () => {
        const snapshot = {
            id: 'a',
            children: [{ id: 'b', children: [{ id: 'c', children: [] }] }, { id: 'd' }],
        };

        expect(snapshotMaxRelativeDepth(snapshot)).toBe(2);
    });
});
