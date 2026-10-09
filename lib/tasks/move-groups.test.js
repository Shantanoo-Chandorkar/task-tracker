import { describe, expect, it } from 'vitest';
import { buildMoveGroups } from './move-groups';

const sublists = [{ id: 'sub-1', name: 'Errands', color: '#123456' }];

function makeTask(id, overrides = {}) {
    return { id, title: id, parent_id: null, sublist_id: null, depth: 0, ...overrides };
}

describe('buildMoveGroups', () => {
    it('offers the Main List for a subtask, keeping its own parent out of the choices', () => {
        const parent = makeTask('parent');
        const other = makeTask('other');
        const child = makeTask('child', { parent_id: 'parent', depth: 1 });

        const groups = buildMoveGroups({ task: child, flatList: [parent, other, child], sublists });

        expect(groups.map((group) => group.id)).toEqual([null]);
        expect(groups[0].canMoveToRoot).toBe(false);
        expect(groups[0].roots.map((root) => root.id)).toEqual(['parent', 'other']);
    });

    it("puts the task's own sublist first and lets a root task move to the other sublists", () => {
        const inSublist = makeTask('in-sublist', { sublist_id: 'sub-1' });
        const sublistNeighbour = makeTask('sublist-neighbour', { sublist_id: 'sub-1' });
        const inMain = makeTask('in-main');

        const groups = buildMoveGroups({
            task: inSublist,
            flatList: [inSublist, sublistNeighbour, inMain],
            sublists,
        });

        expect(groups.map((group) => group.id)).toEqual(['sub-1', null]);
        expect(groups[0].canMoveToRoot).toBe(false);
        expect(groups[1].canMoveToRoot).toBe(true);
    });

    it('hides its own sublist when the task is alone in it', () => {
        const inSublist = makeTask('in-sublist', { sublist_id: 'sub-1' });

        const groups = buildMoveGroups({ task: inSublist, flatList: [inSublist], sublists });

        expect(groups.map((group) => group.id)).toEqual([null]);
    });

    it('treats a root pointing at a deleted sublist as part of the Main List', () => {
        const mover = makeTask('mover', { sublist_id: 'sub-1' });
        const orphan = makeTask('orphan', { sublist_id: 'gone' });

        const groups = buildMoveGroups({ task: mover, flatList: [mover, orphan], sublists });
        const mainGroup = groups.find((group) => group.id === null);

        expect(mainGroup.roots.map((root) => root.id)).toEqual(['orphan']);
    });

    it('leaves out groups with nothing to pick', () => {
        const onlyTask = makeTask('only');

        const groups = buildMoveGroups({ task: onlyTask, flatList: [onlyTask], sublists });

        expect(groups.map((group) => group.id)).toEqual(['sub-1']);
    });
});
