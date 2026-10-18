import { describe, expect, it } from 'vitest';
import {
    flatToTree,
    createStableIdsReader,
    createStableTreeBuilder,
    isStartOfUnprioritisedTier,
} from './task-tree';

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

describe('createStableTreeBuilder', () => {
    function nodeById(roots, taskId) {
        const queue = [...roots];
        while (queue.length > 0) {
            const node = queue.shift();
            if (node.id === taskId) return node;
            queue.push(...node.children);
        }
        return undefined;
    }

    it('builds the same tree as flatToTree', () => {
        const buildTree = createStableTreeBuilder();

        expect(buildTree(flatTaskList)).toEqual(flatToTree(flatTaskList));
    });

    it('returns the very same roots array when nothing changed', () => {
        const buildTree = createStableTreeBuilder();
        const firstRoots = buildTree(flatTaskList);

        expect(buildTree([...flatTaskList])).toBe(firstRoots);
    });

    it('keeps untouched nodes and replaces only the edited task and its ancestors', () => {
        const buildTree = createStableTreeBuilder();
        const firstRoots = buildTree(flatTaskList);
        const editedList = flatTaskList.map((task) =>
            task.id === 'grandchild' ? { ...task, title: 'Edited' } : task,
        );

        const secondRoots = buildTree(editedList);

        expect(nodeById(secondRoots, 'otherRoot')).toBe(nodeById(firstRoots, 'otherRoot'));
        expect(nodeById(secondRoots, 'grandchild')).not.toBe(nodeById(firstRoots, 'grandchild'));
        expect(nodeById(secondRoots, 'child')).not.toBe(nodeById(firstRoots, 'child'));
        expect(nodeById(secondRoots, 'root')).not.toBe(nodeById(firstRoots, 'root'));
        expect(nodeById(secondRoots, 'grandchild').title).toBe('Edited');
    });

    it('rebuilds the parent when a child is added, and keeps the sibling subtree', () => {
        const buildTree = createStableTreeBuilder();
        const firstRoots = buildTree(flatTaskList);

        const secondRoots = buildTree([
            ...flatTaskList,
            { id: 'newChild', parent_id: 'otherRoot', depth: 1, status_id: 'todo' },
        ]);

        expect(nodeById(secondRoots, 'otherRoot').children.map((child) => child.id)).toEqual([
            'newChild',
        ]);
        expect(nodeById(secondRoots, 'root')).toBe(nodeById(firstRoots, 'root'));
    });
});

describe('createStableIdsReader', () => {
    it('reads the ids in order', () => {
        const readStableIds = createStableIdsReader();

        expect(readStableIds([{ id: 'a' }, { id: 'b' }])).toEqual(['a', 'b']);
    });

    it('returns the same array while the ids stay the same, even for new row objects', () => {
        const readStableIds = createStableIdsReader();
        const firstIds = readStableIds([{ id: 'a', title: 'one' }, { id: 'b' }]);

        expect(readStableIds([{ id: 'a', title: 'edited' }, { id: 'b' }])).toBe(firstIds);
    });

    it('returns a new array when the ids or their order change', () => {
        const readStableIds = createStableIdsReader();
        const firstIds = readStableIds([{ id: 'a' }, { id: 'b' }]);

        expect(readStableIds([{ id: 'b' }, { id: 'a' }])).not.toBe(firstIds);
    });
});
