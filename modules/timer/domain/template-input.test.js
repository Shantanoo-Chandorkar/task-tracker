import { describe, expect, it } from 'vitest';
import { checkTemplateName, checkTemplateBlocks } from './template-input';
import { POMODORO_PRESET_BLOCKS } from '@/modules/timer/timer-limits';

describe('checkTemplateName', () => {
    it('accepts a trimmed name', () => {
        expect(checkTemplateName('  Deep work  ')).toEqual({ name: 'Deep work' });
    });

    it('rejects an empty name', () => {
        const nameCheck = checkTemplateName('   ');
        expect(nameCheck.error).toBeTruthy();
        expect(nameCheck.code).toBe('TIMER_TEMPLATE_NAME_REQUIRED');
    });

    it('rejects a name over 200 characters', () => {
        const nameCheck = checkTemplateName('a'.repeat(201));
        expect(nameCheck.code).toBe('TIMER_TEMPLATE_NAME_TOO_LONG');
    });
});

describe('checkTemplateBlocks', () => {
    it('accepts a valid block list and normalizes it', () => {
        const blocksCheck = checkTemplateBlocks([
            { kind: 'work', label: 'Focus', durationSeconds: 1500 },
            { kind: 'break', durationSeconds: 300 },
        ]);

        expect(blocksCheck.blocks).toEqual([
            { kind: 'work', label: 'Focus', durationSeconds: 1500 },
            { kind: 'break', label: 'Break', durationSeconds: 300 },
        ]);
    });

    it('accepts the Pomodoro preset unchanged', () => {
        const blocksCheck = checkTemplateBlocks(POMODORO_PRESET_BLOCKS);
        expect(blocksCheck.blocks).toEqual(POMODORO_PRESET_BLOCKS);
    });

    it('rejects a non-array value', () => {
        expect(checkTemplateBlocks('not an array').code).toBe('TIMER_TEMPLATE_BLOCKS_INVALID');
    });

    it('rejects an empty array', () => {
        expect(checkTemplateBlocks([]).code).toBe('TIMER_TEMPLATE_BLOCKS_INVALID');
    });

    it('rejects more than 20 blocks', () => {
        const tooMany = Array.from({ length: 21 }, () => ({ kind: 'work', durationSeconds: 60 }));
        expect(checkTemplateBlocks(tooMany).code).toBe('TIMER_TEMPLATE_BLOCKS_INVALID');
    });

    it('rejects an unknown block kind', () => {
        expect(checkTemplateBlocks([{ kind: 'rest', durationSeconds: 60 }]).code).toBe(
            'TIMER_TEMPLATE_BLOCKS_INVALID',
        );
    });

    it('rejects a duration below the minimum', () => {
        expect(checkTemplateBlocks([{ kind: 'work', durationSeconds: 59 }]).code).toBe(
            'TIMER_TEMPLATE_BLOCKS_INVALID',
        );
    });

    it('rejects a duration above the maximum', () => {
        expect(checkTemplateBlocks([{ kind: 'work', durationSeconds: 14401 }]).code).toBe(
            'TIMER_TEMPLATE_BLOCKS_INVALID',
        );
    });

    it('rejects a non-integer duration', () => {
        expect(checkTemplateBlocks([{ kind: 'work', durationSeconds: 90.5 }]).code).toBe(
            'TIMER_TEMPLATE_BLOCKS_INVALID',
        );
    });

    it('rejects a label over 100 characters', () => {
        expect(
            checkTemplateBlocks([{ kind: 'work', durationSeconds: 60, label: 'a'.repeat(101) }])
                .code,
        ).toBe('TIMER_TEMPLATE_BLOCKS_INVALID');
    });

    it('rejects a non-object block entry', () => {
        expect(checkTemplateBlocks(['work']).code).toBe('TIMER_TEMPLATE_BLOCKS_INVALID');
    });
});
