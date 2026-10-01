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
    countSublistTasks,
    buildMoveTargetTree,
    hasSelectableMoveTarget,
    findMatchingMoveTargets,
    isMoveTargetSelectable,
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
        expect(
            getTaskIds(
                flatToTree([
                    { id: 'a', is_prioritised: true },
                    { id: 'b', is_prioritised: true },
                ]),
            ),
        ).toEqual(['a', 'b']);
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
        expect(recomputeDepth('otherRoot', 2, flatTaskList)).toEqual([
            { id: 'otherRoot', depth: 2 },
        ]);
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

describe('buildMoveTargetTree', () => {
    // Reported bug shape: grandparent > parent > (moving > movingChild, sibling > siblingChild), plus uncle and otherRoot
    const moveTasks = [
        { id: 'grandparent', parent_id: null },
        { id: 'parent', parent_id: 'grandparent' },
        { id: 'moving', parent_id: 'parent' },
        { id: 'movingChild', parent_id: 'moving' },
        { id: 'sibling', parent_id: 'parent' },
        { id: 'siblingChild', parent_id: 'sibling' },
        { id: 'uncle', parent_id: 'grandparent' },
        { id: 'otherRoot', parent_id: null },
    ];
    const movingTask = moveTasks.find((task) => task.id === 'moving');

    function collectIds(nodes) {
        return nodes.flatMap((node) => [node.id, ...collectIds(node.children)]);
    }

    it('removes the moving task and its whole subtree', () => {
        const ids = collectIds(buildMoveTargetTree(moveTasks, movingTask));
        expect(ids).not.toContain('moving');
        expect(ids).not.toContain('movingChild');
    });

    it('keeps the siblings nested under their real parent', () => {
        const [grandparentNode] = buildMoveTargetTree(moveTasks, movingTask);
        const parentNode = grandparentNode.children.find((node) => node.id === 'parent');
        expect(parentNode.children.map((node) => node.id)).toEqual(['sibling']);
        expect(parentNode.children[0].children.map((node) => node.id)).toEqual(['siblingChild']);
    });

    it('flags only the direct parent as the current parent', () => {
        const flaggedIds = [];
        (function walk(nodes) {
            for (const node of nodes) {
                if (node.isCurrentParent) flaggedIds.push(node.id);
                walk(node.children);
            }
        })(buildMoveTargetTree(moveTasks, movingTask));
        expect(flaggedIds).toEqual(['parent']);
    });

    it('treats a root task as having no current parent', () => {
        const rootTree = buildMoveTargetTree(
            moveTasks,
            moveTasks.find((task) => task.id === 'otherRoot'),
        );
        expect(collectIds(rootTree)).not.toContain('otherRoot');
        expect(rootTree.some((node) => node.isCurrentParent)).toBe(false);
    });

    it('does not mutate the input tasks', () => {
        buildMoveTargetTree(moveTasks, movingTask);
        expect(moveTasks[0]).not.toHaveProperty('isCurrentParent');
        expect(moveTasks[0]).not.toHaveProperty('children');
    });
});

describe('hasSelectableMoveTarget', () => {
    it('is false for an empty tree', () => {
        expect(hasSelectableMoveTarget([])).toBe(false);
    });

    it('is false when the only node is the current parent', () => {
        const onlyParentTree = buildMoveTargetTree(
            [
                { id: 'parent', parent_id: null },
                { id: 'moving', parent_id: 'parent' },
            ],
            { id: 'moving', parent_id: 'parent' },
        );
        expect(hasSelectableMoveTarget(onlyParentTree)).toBe(false);
    });

    it('is true when the current parent has another child', () => {
        const parentWithSiblingTree = buildMoveTargetTree(
            [
                { id: 'parent', parent_id: null },
                { id: 'moving', parent_id: 'parent' },
                { id: 'sibling', parent_id: 'parent' },
            ],
            { id: 'moving', parent_id: 'parent' },
        );
        expect(hasSelectableMoveTarget(parentWithSiblingTree)).toBe(true);
    });
});

describe('findMatchingMoveTargets', () => {
    const searchTasks = [
        { id: 'design', title: 'Design landing page', parent_id: null },
        { id: 'palette', title: 'Pick a colour palette', parent_id: 'design' },
        { id: 'contrast', title: 'Check contrast ratios', parent_id: 'palette' },
        { id: 'plan', title: 'Plan v1.0 (beta)', parent_id: null },
        { id: 'movingTask', title: 'Moving task', parent_id: 'design' },
    ];
    const movingTask = searchTasks.find((task) => task.id === 'movingTask');
    const searchRoots = buildMoveTargetTree(searchTasks, movingTask);

    it('returns nothing for an empty or whitespace-only query', () => {
        expect(findMatchingMoveTargets(searchRoots, '')).toEqual([]);
        expect(findMatchingMoveTargets(searchRoots, '   ')).toEqual([]);
    });

    it('matches case-insensitively and trims the query', () => {
        const matches = findMatchingMoveTargets(searchRoots, '  PALETTE ');
        expect(matches.map((match) => match.id)).toEqual(['palette']);
    });

    it('finds a deeply nested task with its ancestor titles as the breadcrumb', () => {
        expect(findMatchingMoveTargets(searchRoots, 'contrast')).toEqual([
            {
                id: 'contrast',
                title: 'Check contrast ratios',
                breadcrumb: ['Design landing page', 'Pick a colour palette'],
            },
        ]);
    });

    it('returns every match in tree order, parents before their children', () => {
        const matches = findMatchingMoveTargets(searchRoots, 'a');
        expect(matches.map((match) => match.id)).toEqual(['palette', 'contrast', 'plan']);
    });

    it('never offers the current parent, but still finds its other children', () => {
        const matches = findMatchingMoveTargets(searchRoots, 'design');
        expect(matches.map((match) => match.id)).toEqual([]);
        expect(findMatchingMoveTargets(searchRoots, 'palette')[0].breadcrumb).toEqual([
            'Design landing page',
        ]);
    });

    it('never offers the moving task itself', () => {
        expect(findMatchingMoveTargets(searchRoots, 'moving')).toEqual([]);
    });

    it('treats regex characters in the query as literal text', () => {
        expect(findMatchingMoveTargets(searchRoots, 'v1.0 (beta)')).toHaveLength(1);
        expect(findMatchingMoveTargets(searchRoots, 'v1x0')).toEqual([]);
        expect(findMatchingMoveTargets(searchRoots, '(')).toHaveLength(1);
    });

    it('returns an empty array when nothing matches', () => {
        expect(findMatchingMoveTargets(searchRoots, 'zzz')).toEqual([]);
    });
});

describe('move target depth limit', () => {
    const MAX_ALLOWED_DEPTH = 2;
    // Chain top (0) > middle (1) > bottom (2), plus a leaf mover and a mover that has one child
    const depthTasks = [
        { id: 'top', parent_id: null, depth: 0 },
        { id: 'middle', parent_id: 'top', depth: 1 },
        { id: 'bottom', parent_id: 'middle', depth: 2 },
        { id: 'leafMover', parent_id: null, depth: 0 },
        { id: 'treeMover', parent_id: null, depth: 0 },
        { id: 'treeMoverChild', parent_id: 'treeMover', depth: 1 },
    ];

    function getTooDeepIds(movingTaskId, maxAllowedDepth) {
        const movingTask = depthTasks.find((task) => task.id === movingTaskId);
        const tooDeepIds = [];
        (function walk(nodes) {
            for (const node of nodes) {
                if (node.isTooDeep) tooDeepIds.push(node.id);
                walk(node.children);
            }
        })(buildMoveTargetTree(depthTasks, movingTask, maxAllowedDepth));
        return tooDeepIds;
    }

    it('flags only the targets that would push a single task past the limit', () => {
        expect(getTooDeepIds('leafMover', MAX_ALLOWED_DEPTH)).toEqual(['bottom']);
    });

    it('counts the height of the moving subtree, not just the task itself', () => {
        expect(getTooDeepIds('treeMover', MAX_ALLOWED_DEPTH)).toEqual(['middle', 'bottom']);
    });

    it('flags nothing when no limit is given', () => {
        expect(getTooDeepIds('treeMover')).toEqual([]);
    });

    it('treats the current parent and too-deep targets as not selectable', () => {
        expect(isMoveTargetSelectable({ isCurrentParent: true, isTooDeep: false })).toBe(false);
        expect(isMoveTargetSelectable({ isCurrentParent: false, isTooDeep: true })).toBe(false);
        expect(isMoveTargetSelectable({ isCurrentParent: false, isTooDeep: false })).toBe(true);
    });

    it('reports no selectable target when everything left is too deep', () => {
        const movingTask = { id: 'tall', parent_id: null, depth: 0 };
        const tallTasks = [
            movingTask,
            { id: 'tallChild', parent_id: 'tall', depth: 1 },
            { id: 'tallGrandchild', parent_id: 'tallChild', depth: 2 },
            { id: 'shallowRoot', parent_id: null, depth: 0 },
        ];
        // Height 2 under a root target needs depth 0 + 1 + 2 = 3 > 2, so even root targets are refused
        const tallRoots = buildMoveTargetTree(tallTasks, movingTask, MAX_ALLOWED_DEPTH);
        expect(hasSelectableMoveTarget(tallRoots)).toBe(false);
    });

    it('never offers a too-deep task from search', () => {
        const titledTasks = depthTasks.map((task) => ({ ...task, title: task.id }));
        const movingTask = titledTasks.find((task) => task.id === 'leafMover');
        const roots = buildMoveTargetTree(titledTasks, movingTask, MAX_ALLOWED_DEPTH);
        expect(findMatchingMoveTargets(roots, 'bottom')).toEqual([]);
        expect(findMatchingMoveTargets(roots, 'middle')).toHaveLength(1);
    });
});
