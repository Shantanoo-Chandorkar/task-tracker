import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closestCenter } from '@dnd-kit/core';
import { siblingScopedCollisionDetection } from './sibling-collision';

vi.mock('@dnd-kit/core', () => ({ closestCenter: vi.fn() }));

function container(id, data) {
    return { id, data: { current: data } };
}

function detect(activeData, containers) {
    return siblingScopedCollisionDetection({
        active: { data: { current: activeData } },
        droppableContainers: containers,
    });
}

function containerIdsPassedToClosestCenter(callIndex) {
    return closestCenter.mock.calls[callIndex][0].droppableContainers.map(
        (droppableContainer) => droppableContainer.id,
    );
}

describe('siblingScopedCollisionDetection', () => {
    beforeEach(() => {
        closestCenter.mockReset();
        closestCenter.mockReturnValue([{ id: 'hit' }]);
    });

    it('uses every container for a sublist header drag', () => {
        const containers = [container('s1', { type: 'sublist' }), container('t1', {})];

        detect({ type: 'sublist' }, containers);

        expect(containerIdsPassedToClosestCenter(0)).toEqual(['s1', 't1']);
    });

    it('limits a task drag to containers with the same parent, sublist and priority tier', () => {
        const containers = [
            container('same', { parentId: 'p', sublistId: 's', isPrioritised: true }),
            container('other-parent', { parentId: 'q', sublistId: 's', isPrioritised: true }),
            container('other-sublist', { parentId: 'p', sublistId: 'x', isPrioritised: true }),
            container('other-tier', { parentId: 'p', sublistId: 's', isPrioritised: false }),
        ];

        detect({ parentId: 'p', sublistId: 's', isPrioritised: true }, containers);

        expect(containerIdsPassedToClosestCenter(0)).toEqual(['same']);
    });

    it('treats missing parent, sublist and tier as null, null and not prioritised', () => {
        const containers = [
            container('plain', {}),
            container('explicit', { parentId: null, sublistId: null, isPrioritised: false }),
            container('prioritised', { isPrioritised: true }),
        ];

        detect({}, containers);

        expect(containerIdsPassedToClosestCenter(0)).toEqual(['plain', 'explicit']);
    });

    it('returns the sibling hits when there are any', () => {
        expect(detect({}, [container('a', {})])).toEqual([{ id: 'hit' }]);
        expect(closestCenter).toHaveBeenCalledTimes(1);
    });

    it('falls back to every container when no sibling is hit', () => {
        closestCenter.mockReturnValueOnce([]).mockReturnValueOnce([{ id: 'fallback' }]);
        const containers = [container('a', {}), container('b', { parentId: 'p' })];

        const hits = detect({}, containers);

        expect(hits).toEqual([{ id: 'fallback' }]);
        expect(containerIdsPassedToClosestCenter(1)).toEqual(['a', 'b']);
    });

    it('copes with a drag that has no data', () => {
        expect(() =>
            siblingScopedCollisionDetection({ active: null, droppableContainers: [] }),
        ).not.toThrow();
    });
});
