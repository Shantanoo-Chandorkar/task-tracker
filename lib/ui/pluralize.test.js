import { describe, expect, it } from 'vitest';
import { pluralize } from './pluralize';

describe('pluralize', () => {
    it.each([
        [0, '0 tasks'],
        [1, '1 task'],
        [2, '2 tasks'],
    ])('writes %i as "%s"', (count, expected) => {
        expect(pluralize(count, 'task')).toBe(expected);
    });
});
