import { describe, expect, it } from 'vitest';
import { resolveSessionDisplayLabel, resolveSessionBlockDisplay } from './session-display';

describe('resolveSessionDisplayLabel', () => {
    it('prefers the session’s own label', () => {
        expect(
            resolveSessionDisplayLabel({ label: 'Deep work', tasks: { title: 'Write report' } }),
        ).toBe('Deep work');
    });

    it('falls back to the attached task’s title', () => {
        expect(resolveSessionDisplayLabel({ label: null, tasks: { title: 'Write report' } })).toBe(
            'Write report',
        );
    });

    it('falls back to the attached habit’s title', () => {
        expect(
            resolveSessionDisplayLabel({ label: null, tasks: null, habits: { title: 'Read' } }),
        ).toBe('Read');
    });

    it('returns null when there is nothing to show', () => {
        expect(resolveSessionDisplayLabel({ label: null, tasks: null, habits: null })).toBeNull();
    });
});

describe('resolveSessionBlockDisplay', () => {
    const BLOCKS = [
        { kind: 'work', label: 'Focus', durationSeconds: 1500 },
        { kind: 'break', label: 'Break', durationSeconds: 300 },
    ];

    it('builds the current block’s display info', () => {
        const display = resolveSessionBlockDisplay({
            block_index: 0,
            timer_templates: { name: 'Pomodoro', blocks: BLOCKS },
        });

        expect(display).toEqual({ block: BLOCKS[0], blockIndex: 0, total: 2, isLastBlock: false });
    });

    it('flags the last block', () => {
        const display = resolveSessionBlockDisplay({
            block_index: 1,
            timer_templates: { blocks: BLOCKS },
        });

        expect(display.isLastBlock).toBe(true);
    });

    it('returns null when there is no template', () => {
        expect(resolveSessionBlockDisplay({ block_index: 0, timer_templates: null })).toBeNull();
    });

    it('returns null when there is no block index', () => {
        expect(
            resolveSessionBlockDisplay({ block_index: null, timer_templates: { blocks: BLOCKS } }),
        ).toBeNull();
    });
});
