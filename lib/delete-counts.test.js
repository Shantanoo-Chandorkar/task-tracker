import { describe, expect, it } from 'vitest';
import { countSpaceContents } from './delete-counts';

describe('countSpaceContents', () => {
    it('counts only the lists in that space and sums their tasks', () => {
        const cachedLists = [
            { id: 'a', space_id: 's1', task_count: 3 },
            { id: 'b', space_id: 's1', task_count: 2 },
            { id: 'c', space_id: 's2', task_count: 9 },
        ];

        expect(countSpaceContents('s1', cachedLists)).toEqual({ lists: 2, tasks: 5 });
    });

    it('returns zeros for a space with no lists', () => {
        expect(countSpaceContents('s1', [])).toEqual({ lists: 0, tasks: 0 });
    });
});
