import { describe, expect, it } from 'vitest';
import {
    buildMoveTargetTree,
    hasSelectableMoveTarget,
    findMatchingMoveTargets,
    isMoveTargetSelectable,
} from './move-target-tree';

describe('buildMoveTargetTree', () => {
    // Bug shape: grandparent > parent > (moving > movingChild, sibling > siblingChild), plus uncle and otherRoot
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

    /**
     * Collects the ids of the targets flagged too deep when moving one of the fixture tasks.
     *
     * @param {string} movingTaskId - Id of the fixture task being moved
     * @param {number} [maxAllowedDepth] - Depth limit passed to the tree builder; omit for none
     * @returns {string[]} Ids flagged `isTooDeep`, in tree order
     */
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
