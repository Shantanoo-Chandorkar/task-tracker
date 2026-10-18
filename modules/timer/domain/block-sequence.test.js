import { describe, expect, it } from 'vitest';
import { BlockSequence } from './block-sequence';

const BLOCKS = [
    { kind: 'work', label: 'Focus', durationSeconds: 1500 },
    { kind: 'break', label: 'Short break', durationSeconds: 300 },
    { kind: 'work', label: 'Focus', durationSeconds: 1500 },
    { kind: 'break', label: 'Long break', durationSeconds: 900 },
];

describe('BlockSequence', () => {
    it('returns a block by position, or null out of range', () => {
        const sequence = new BlockSequence(BLOCKS);

        expect(sequence.getBlock(0)).toEqual(BLOCKS[0]);
        expect(sequence.getBlock(3)).toEqual(BLOCKS[3]);
        expect(sequence.getBlock(4)).toBeNull();
        expect(sequence.getBlock(-1)).toBeNull();
    });

    it('reports the total block count', () => {
        expect(new BlockSequence(BLOCKS).totalCount()).toBe(4);
    });

    it('identifies only the last block', () => {
        const sequence = new BlockSequence(BLOCKS);

        expect(sequence.isLastBlock(0)).toBe(false);
        expect(sequence.isLastBlock(2)).toBe(false);
        expect(sequence.isLastBlock(3)).toBe(true);
    });

    it('gives the next index, or null at the last block', () => {
        const sequence = new BlockSequence(BLOCKS);

        expect(sequence.nextIndex(0)).toBe(1);
        expect(sequence.nextIndex(2)).toBe(3);
        expect(sequence.nextIndex(3)).toBeNull();
    });

    it('counts only work blocks strictly before the current index', () => {
        const sequence = new BlockSequence(BLOCKS);

        expect(sequence.completedWorkBlockCount(0)).toBe(0);
        expect(sequence.completedWorkBlockCount(2)).toBe(1);
        expect(sequence.completedWorkBlockCount(4)).toBe(2);
    });

    it('counts the sequence total work blocks', () => {
        expect(new BlockSequence(BLOCKS).totalWorkBlockCount()).toBe(2);
    });
});
