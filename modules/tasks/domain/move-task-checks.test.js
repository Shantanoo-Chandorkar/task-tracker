import { describe, it, expect } from 'vitest';
import {
    wouldCreateCycle,
    exceedsMaxDepthAfterMove,
    resolveRootAncestorSublistId,
} from './move-task-checks';

// a (depth 0, in sublist s1) > b (1) > c (2); d is a separate root
const listTaskLinks = [
    { id: 'a', parent_id: null, depth: 0, sublist_id: 's1' },
    { id: 'b', parent_id: 'a', depth: 1, sublist_id: null },
    { id: 'c', parent_id: 'b', depth: 2, sublist_id: null },
    { id: 'd', parent_id: null, depth: 0, sublist_id: null },
];

describe('wouldCreateCycle', () => {
    it.each([
        ['its own parent', 'a', 'a', true],
        ['a direct child', 'a', 'b', true],
        ['a deeper descendant', 'a', 'c', true],
        ['an unrelated task', 'a', 'd', false],
        ['its own ancestor', 'c', 'a', false],
    ])('moving a task under %s', (_label, taskId, newParentId, expected) => {
        expect(wouldCreateCycle(taskId, newParentId, listTaskLinks)).toBe(expected);
    });
});

describe('exceedsMaxDepthAfterMove', () => {
    const maxDepth = 2;

    it.each([
        ['a leaf one level deeper, still allowed', 'd', 0, 1, false],
        ['a leaf landing exactly on the limit', 'd', 0, 2, false],
        ['a leaf landing below the limit', 'd', 0, 3, true],
        ['a subtree whose deepest task would pass the limit', 'a', 0, 1, true],
        ['a subtree moved up, never exceeding', 'b', 1, -1, false],
        ['a subtree moved sideways at the limit', 'a', 0, 0, false],
    ])('%s', (_label, taskId, taskDepth, depthDelta, expected) => {
        const task = { id: taskId, depth: taskDepth };

        expect(exceedsMaxDepthAfterMove({ task, depthDelta, listTaskLinks, maxDepth })).toBe(
            expected,
        );
    });

    it('falls back to the task depth for a descendant that is missing from the list', () => {
        const task = { id: 'a', depth: 0 };
        const partialList = [{ id: 'b', parent_id: 'a' }];

        expect(
            exceedsMaxDepthAfterMove({ task, depthDelta: 3, listTaskLinks: partialList, maxDepth }),
        ).toBe(true);
    });
});

describe('resolveRootAncestorSublistId', () => {
    it.each([
        ['a grandchild under a root in a sublist', 'c', 's1'],
        ['a child under a root in a sublist', 'b', 's1'],
        ['a task under a root with no sublist', 'd', null],
    ])('%s', (_label, taskId, expected) => {
        expect(resolveRootAncestorSublistId(taskId, listTaskLinks)).toBe(expected);
    });

    it('is null for a task that is not in the list', () => {
        expect(resolveRootAncestorSublistId('missing', listTaskLinks)).toBeNull();
    });
});
