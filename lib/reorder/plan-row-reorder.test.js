import { describe, expect, it } from 'vitest';
import { planRowReorder } from './plan-row-reorder';

const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('planRowReorder', () => {
    it('moves a row down onto another and returns rows and ids in the new order', () => {
        const plan = planRowReorder(rows, 'a', 'c');

        expect(plan.reorderedIds).toEqual(['b', 'c', 'a']);
        expect(plan.reorderedRows).toEqual([{ id: 'b' }, { id: 'c' }, { id: 'a' }]);
    });

    it('moves a row up onto another', () => {
        expect(planRowReorder(rows, 'c', 'a').reorderedIds).toEqual(['c', 'a', 'b']);
    });

    it('does not change the rows it was given', () => {
        planRowReorder(rows, 'a', 'c');

        expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    });

    it('ignores a drop when the dragged row is not in the group', () => {
        expect(planRowReorder(rows, 'gone', 'a')).toBeNull();
    });

    it('ignores a drop when the target row is not in the group', () => {
        expect(planRowReorder(rows, 'a', 'gone')).toBeNull();
    });
});
