import { describe, expect, it } from 'vitest';
import {
    flatToTree,
    isStartOfUnprioritisedTier,
    flattenTreeDepthFirst,
    findAncestors,
    recomputeDepth,
    findDescendantIds,
    findIncompleteDescendants,
    findCompletedDescendants,
    deepCloneSubtree,
} from './tree';

const DONE_STATUS_ID = 'done';

// Two roots; the first has a child that has a grandchild
const flatTaskList = [
    { id: 'root', parent_id: null, depth: 0, status_id: 'todo' },
    { id: 'child', parent_id: 'root', depth: 1, status_id: DONE_STATUS_ID },
    { id: 'grandchild', parent_id: 'child', depth: 2, status_id: 'todo' },
    { id: 'otherRoot', parent_id: null, depth: 0, status_id: 'todo' },
];

describe('flatToTree', () => {
    it('returns an empty array for an empty list', () => {
        expect(flatToTree([])).toEqual([]);
    });

    it('nests children under their parent', () => {
        const rootTasks = flatToTree(flatTaskList);
        expect(rootTasks.map((task) => task.id)).toEqual(['root', 'otherRoot']);
        expect(rootTasks[0].children[0].id).toBe('child');
        expect(rootTasks[0].children[0].children[0].id).toBe('grandchild');
    });

    it('treats a task whose parent is missing as a root instead of dropping it', () => {
        const rootTasks = flatToTree([{ id: 'orphan', parent_id: 'gone' }]);
        expect(rootTasks.map((task) => task.id)).toEqual(['orphan']);
    });

    it('treats an undefined parent_id as a root', () => {
        expect(flatToTree([{ id: 'a' }]).map((task) => task.id)).toEqual(['a']);
    });

    it('does not mutate the input tasks', () => {
        flatToTree(flatTaskList);
        expect(flatTaskList[0]).not.toHaveProperty('children');
    });
});

describe('flatToTree priority ordering', () => {
    const getTaskIds = (tasks) => tasks.map((task) => task.id);

    it('puts prioritised roots first and keeps position order inside each tier', () => {
        const rootTasks = flatToTree([
            { id: 'a', parent_id: null },
            { id: 'b', parent_id: null, is_prioritised: true },
            { id: 'c', parent_id: null },
            { id: 'd', parent_id: null, is_prioritised: true },
        ]);
        expect(getTaskIds(rootTasks)).toEqual(['b', 'd', 'a', 'c']);
    });

    it('keeps the subtree with a prioritised parent', () => {
        const rootTasks = flatToTree([
            { id: 'a', parent_id: null },
            { id: 'a1', parent_id: 'a' },
            { id: 'b', parent_id: null, is_prioritised: true },
            { id: 'b1', parent_id: 'b' },
        ]);
        expect(getTaskIds(rootTasks)).toEqual(['b', 'a']);
        expect(getTaskIds(rootTasks[0].children)).toEqual(['b1']);
    });

    it('lifts a prioritised child only above its own unprioritised siblings', () => {
        const [rootTask, otherRoot] = flatToTree([
            { id: 'root', parent_id: null },
            { id: 'x', parent_id: 'root' },
            { id: 'y', parent_id: 'root', is_prioritised: true },
            { id: 'other', parent_id: null },
            { id: 'z', parent_id: 'other' },
        ]);
        expect(getTaskIds(rootTask.children)).toEqual(['y', 'x']);
        expect(getTaskIds(otherRoot.children)).toEqual(['z']);
        expect(getTaskIds([rootTask, otherRoot])).toEqual(['root', 'other']);
    });

    it('leaves order untouched when nothing or everything is prioritised', () => {
        expect(getTaskIds(flatToTree([{ id: 'a' }, { id: 'b' }]))).toEqual(['a', 'b']);
        expect(getTaskIds(flatToTree([{ id: 'a', is_prioritised: true }, { id: 'b', is_prioritised: true }]))).toEqual([
            'a',
            'b',
        ]);
    });
});

describe('isStartOfUnprioritisedTier', () => {
    const siblings = [{ is_prioritised: true }, { is_prioritised: true }, {}, {}];

    it('is true only at the first unprioritised sibling after a prioritised one', () => {
        expect(siblings.map((_, index) => isStartOfUnprioritisedTier(siblings, index))).toEqual([
            false,
            false,
            true,
            false,
        ]);
    });

    it('is never true when a tier is missing', () => {
        expect(isStartOfUnprioritisedTier([{}, {}], 1)).toBe(false);
        expect(isStartOfUnprioritisedTier([{ is_prioritised: true }], 0)).toBe(false);
    });
});

describe('flattenTreeDepthFirst', () => {
    it('places each task directly before its descendants', () => {
        expect(flattenTreeDepthFirst(flatTaskList).map((task) => task.id)).toEqual([
            'root',
            'child',
            'grandchild',
            'otherRoot',
        ]);
    });

    it('recomputes depth from the tree, ignoring a stale stored depth', () => {
        const staleDepthTasks = [
            { id: 'a', parent_id: null, depth: 5 },
            { id: 'b', parent_id: 'a', depth: 0 },
        ];
        expect(flattenTreeDepthFirst(staleDepthTasks).map((task) => task.depth)).toEqual([0, 1]);
    });

    it('returns an empty array for an empty list', () => {
        expect(flattenTreeDepthFirst([])).toEqual([]);
    });
});

describe('findAncestors', () => {
    it('returns ancestors closest first', () => {
        expect(findAncestors('grandchild', flatTaskList).map((task) => task.id)).toEqual(['child', 'root']);
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

describe('recomputeDepth', () => {
    it('shifts the task and all descendants by the same amount', () => {
        expect(recomputeDepth('child', 3, flatTaskList)).toEqual([
            { id: 'child', depth: 3 },
            { id: 'grandchild', depth: 4 },
        ]);
    });

    it('supports moving a subtree up to a shallower depth', () => {
        expect(recomputeDepth('child', 0, flatTaskList)).toEqual([
            { id: 'child', depth: 0 },
            { id: 'grandchild', depth: 1 },
        ]);
    });

    it('returns no updates for an unknown task id', () => {
        expect(recomputeDepth('missing', 1, flatTaskList)).toEqual([]);
    });

    it('returns only the task itself when it has no children', () => {
        expect(recomputeDepth('otherRoot', 2, flatTaskList)).toEqual([{ id: 'otherRoot', depth: 2 }]);
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

describe('findIncompleteDescendants / findCompletedDescendants', () => {
    it('splits descendants by done status', () => {
        expect(findIncompleteDescendants('root', flatTaskList, DONE_STATUS_ID).map((task) => task.id)).toEqual([
            'grandchild',
        ]);
        expect(findCompletedDescendants('root', flatTaskList, DONE_STATUS_ID).map((task) => task.id)).toEqual(['child']);
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
