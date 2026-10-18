import { describe, expect, it } from 'vitest';
import { addDaysToLocalDate } from './local-date';
import {
    checkHabitTitle,
    checkHabitDescription,
    checkHabitColor,
    checkHabitPolarity,
    checkHabitMeasureKind,
    checkHabitPolarityMeasureCombination,
    checkHabitTargetValue,
    checkHabitUnitCode,
    checkHabitRecurrence,
    checkHabitStartedOn,
    pickHabitUpdates,
    checkHabitCategoryName,
    pickHabitCategoryUpdates,
    checkHabitEntryLocalDate,
    checkHabitEntryValue,
    checkHabitEntryBatch,
    checkHabitEntryNote,
} from './habit-input';

describe('checkHabitTitle', () => {
    it('trims the title and strips tags', () => {
        expect(checkHabitTitle('  <b>Read</b> daily ')).toEqual({ title: 'Read daily' });
    });

    it.each([[undefined], [null], [''], ['   '], ['<i></i>']])(
        'rejects %j as missing (0 chars)',
        (rawTitle) => {
            const titleCheck = checkHabitTitle(rawTitle);
            expect(titleCheck.error).toBe('Title is required');
            expect(titleCheck.code).toBe('HABIT_TITLE_REQUIRED');
        },
    );

    it('accepts exactly 200 characters and rejects 201', () => {
        expect(checkHabitTitle('x'.repeat(200)).title).toHaveLength(200);
        const titleCheck = checkHabitTitle('x'.repeat(201));
        expect(titleCheck.code).toBe('HABIT_TITLE_TOO_LONG');
    });
});

describe('checkHabitDescription', () => {
    it('gives null for an empty or missing description (0 chars)', () => {
        expect(checkHabitDescription('')).toEqual({ description: null });
        expect(checkHabitDescription(undefined)).toEqual({ description: null });
    });

    it('accepts a realistic 300-character rich-text paste', () => {
        const paste = `<p>${'Stretch for ten minutes every morning before work. '.repeat(6)}</p>`;
        const descriptionCheck = checkHabitDescription(paste);
        expect(descriptionCheck.error).toBeUndefined();
        expect(descriptionCheck.description).toContain('Stretch for ten minutes');
    });

    it('rejects a description over 10000 characters', () => {
        const descriptionCheck = checkHabitDescription('x'.repeat(10001));
        expect(descriptionCheck.code).toBe('HABIT_DESCRIPTION_TOO_LONG');
    });

    it('removes script tags', () => {
        const { description } = checkHabitDescription('<p>Hi</p><script>alert(1)</script>');
        expect(description).toContain('Hi');
        expect(description).not.toContain('script');
    });
});

describe('checkHabitColor', () => {
    it('accepts a hex colour', () => {
        expect(checkHabitColor('#6b7280')).toBeNull();
    });

    it.each([[undefined], [null], ['red'], ['#fff'], ['#gggggg']])('rejects %j', (rawColor) => {
        expect(checkHabitColor(rawColor)?.code).toBe('HABIT_COLOR_INVALID');
    });
});

describe('checkHabitPolarity', () => {
    it.each([['build'], ['quit']])('accepts %s', (rawPolarity) => {
        expect(checkHabitPolarity(rawPolarity)).toEqual({ polarity: rawPolarity });
    });

    it.each([[undefined], [null], ['build '], ['BUILD'], ['stop']])('rejects %j', (rawPolarity) => {
        expect(checkHabitPolarity(rawPolarity).code).toBe('HABIT_INVALID_POLARITY');
    });
});

describe('checkHabitMeasureKind', () => {
    it.each([['binary'], ['count'], ['quantity'], ['duration']])('accepts %s', (rawMeasureKind) => {
        expect(checkHabitMeasureKind(rawMeasureKind)).toEqual({ measureKind: rawMeasureKind });
    });

    it.each([[undefined], [null], ['scale']])('rejects %j', (rawMeasureKind) => {
        expect(checkHabitMeasureKind(rawMeasureKind).code).toBe('HABIT_INVALID_MEASURE_KIND');
    });
});

describe('checkHabitPolarityMeasureCombination', () => {
    it('allows quit only with binary', () => {
        expect(checkHabitPolarityMeasureCombination('quit', 'binary')).toBeNull();
    });

    it.each([['count'], ['quantity'], ['duration']])(
        'rejects quit paired with %s (decision B4)',
        (measureKind) => {
            expect(checkHabitPolarityMeasureCombination('quit', measureKind).code).toBe(
                'HABIT_POLARITY_MEASURE_MISMATCH',
            );
        },
    );

    it.each([['binary'], ['count'], ['quantity'], ['duration']])(
        'allows build with every measure kind, including %s',
        (measureKind) => {
            expect(checkHabitPolarityMeasureCombination('build', measureKind)).toBeNull();
        },
    );
});

describe('checkHabitTargetValue', () => {
    it('rejects any target value for a binary habit', () => {
        expect(checkHabitTargetValue(5, 'binary').code).toBe('HABIT_TARGET_VALUE_NOT_ALLOWED');
    });

    it('is null and unrejected when omitted for a binary habit', () => {
        expect(checkHabitTargetValue(undefined, 'binary')).toEqual({ targetValue: null });
        expect(checkHabitTargetValue(null, 'binary')).toEqual({ targetValue: null });
    });

    it.each([['count'], ['quantity'], ['duration']])(
        'requires a target value for %s',
        (measureKind) => {
            expect(checkHabitTargetValue(undefined, measureKind).code).toBe(
                'HABIT_TARGET_VALUE_REQUIRED',
            );
        },
    );

    it.each([['count'], ['quantity'], ['duration']])(
        'rejects a zero target for %s',
        (measureKind) => {
            expect(checkHabitTargetValue(0, measureKind).code).toBe('HABIT_TARGET_VALUE_INVALID');
        },
    );

    it.each([['count'], ['quantity'], ['duration']])(
        'rejects a negative target for %s',
        (measureKind) => {
            expect(checkHabitTargetValue(-5, measureKind).code).toBe('HABIT_TARGET_VALUE_INVALID');
        },
    );

    it('accepts a positive target value', () => {
        expect(checkHabitTargetValue(20, 'count')).toEqual({ targetValue: 20 });
    });
});

describe('checkHabitUnitCode', () => {
    it('rejects any unit for a binary or count habit', () => {
        expect(checkHabitUnitCode('km', 'binary').code).toBe('HABIT_UNIT_CODE_NOT_ALLOWED');
        expect(checkHabitUnitCode('km', 'count').code).toBe('HABIT_UNIT_CODE_NOT_ALLOWED');
    });

    it('requires a unit for a quantity habit', () => {
        expect(checkHabitUnitCode(undefined, 'quantity').code).toBe('HABIT_UNIT_CODE_REQUIRED');
    });

    it('rejects a unit from the wrong dimension for a quantity habit', () => {
        // 'min' is a real, recognised duration unit code - just not a distance one.
        expect(checkHabitUnitCode('min', 'quantity').code).toBe('HABIT_UNIT_CODE_INVALID');
    });

    it('accepts a matching unit for a quantity habit', () => {
        expect(checkHabitUnitCode('km', 'quantity')).toEqual({ unitCode: 'km' });
    });

    it('allows a duration habit to omit its unit', () => {
        expect(checkHabitUnitCode(undefined, 'duration')).toEqual({ unitCode: null });
    });

    it('accepts a matching unit for a duration habit', () => {
        expect(checkHabitUnitCode('min', 'duration')).toEqual({ unitCode: 'min' });
    });

    it('rejects a unit from the wrong dimension for a duration habit', () => {
        expect(checkHabitUnitCode('km', 'duration').code).toBe('HABIT_UNIT_CODE_INVALID');
    });

    it('accepts an unrecognised unit as a free-text custom unit (decision B3.1)', () => {
        expect(checkHabitUnitCode('cups', 'quantity')).toEqual({ unitCode: 'cups' });
        expect(checkHabitUnitCode('laps', 'duration')).toEqual({ unitCode: 'laps' });
    });

    it('sanitizes a custom unit the same way other text fields are (trims, strips tags)', () => {
        expect(checkHabitUnitCode('  <b>kg</b>  ', 'quantity')).toEqual({ unitCode: 'kg' });
    });

    it('rejects an empty or whitespace-only custom unit', () => {
        expect(checkHabitUnitCode('   ', 'quantity').code).toBe('HABIT_UNIT_CODE_INVALID');
    });

    it('rejects a custom unit over 30 characters', () => {
        expect(checkHabitUnitCode('a'.repeat(31), 'quantity').code).toBe(
            'HABIT_UNIT_CODE_TOO_LONG',
        );
    });

    it('accepts a custom unit at exactly 30 characters', () => {
        const thirtyChars = 'a'.repeat(30);
        expect(checkHabitUnitCode(thirtyChars, 'quantity')).toEqual({ unitCode: thirtyChars });
    });
});

describe('checkHabitRecurrence', () => {
    it('normalizes a daily rule', () => {
        expect(checkHabitRecurrence({ kind: 'daily' })).toEqual({ recurrence: { kind: 'daily' } });
    });

    it('normalizes and deduplicates weekdays', () => {
        expect(checkHabitRecurrence({ kind: 'weekdays', days: [3, 1, 1, 5] })).toEqual({
            recurrence: { kind: 'weekdays', days: [1, 3, 5] },
        });
    });

    it.each([[[]], [[7]], [[-1]], [['mon']]])('rejects invalid weekdays %j', (days) => {
        expect(checkHabitRecurrence({ kind: 'weekdays', days }).code).toBe(
            'HABIT_RECURRENCE_INVALID',
        );
    });

    it('rejects a weekdays rule whose days field is not an array at all', () => {
        expect(checkHabitRecurrence({ kind: 'weekdays', days: 'not-an-array' }).code).toBe(
            'HABIT_RECURRENCE_INVALID',
        );
    });

    it('accepts a times_per_week rule within 1-7', () => {
        expect(checkHabitRecurrence({ kind: 'times_per_week', count: 3 })).toEqual({
            recurrence: { kind: 'times_per_week', count: 3 },
        });
    });

    it.each([[0], [8], [2.5], [undefined]])(
        'rejects an invalid times_per_week count %j',
        (count) => {
            expect(checkHabitRecurrence({ kind: 'times_per_week', count }).code).toBe(
                'HABIT_RECURRENCE_INVALID',
            );
        },
    );

    it('accepts an every_n_days rule with a valid anchor', () => {
        expect(checkHabitRecurrence({ kind: 'every_n_days', n: 3, anchor: '2026-10-01' })).toEqual({
            recurrence: { kind: 'every_n_days', n: 3, anchor: '2026-10-01' },
        });
    });

    it.each([[0], [366], [-1]])('rejects an invalid every_n_days n %j', (invalidInterval) => {
        expect(
            checkHabitRecurrence({ kind: 'every_n_days', n: invalidInterval, anchor: '2026-10-01' })
                .code,
        ).toBe('HABIT_RECURRENCE_INVALID');
    });

    it('rejects an every_n_days rule with an invalid anchor', () => {
        expect(
            checkHabitRecurrence({ kind: 'every_n_days', n: 3, anchor: '2026-02-30' }).code,
        ).toBe('HABIT_RECURRENCE_INVALID');
    });

    it.each([[undefined], [null], [{}], [{ kind: 'monthly' }], ['daily']])(
        'rejects %j',
        (rawRecurrence) => {
            expect(checkHabitRecurrence(rawRecurrence).code).toBe('HABIT_RECURRENCE_INVALID');
        },
    );
});

describe('checkHabitStartedOn', () => {
    it('accepts today and any past date', () => {
        expect(checkHabitStartedOn('2026-10-18', '2026-10-18')).toEqual({
            startedOn: '2026-10-18',
        });
        expect(checkHabitStartedOn('2026-01-01', '2026-10-18')).toEqual({
            startedOn: '2026-01-01',
        });
    });

    it('rejects a future start date', () => {
        expect(checkHabitStartedOn('2026-10-19', '2026-10-18').code).toBe(
            'HABIT_ENTRY_DATE_IN_FUTURE',
        );
    });

    it('rejects an invalid date', () => {
        expect(checkHabitStartedOn('not-a-date', '2026-10-18').code).toBe(
            'HABIT_ENTRY_DATE_INVALID',
        );
    });
});

describe('pickHabitUpdates', () => {
    it('keeps only allowlisted fields that were actually sent', () => {
        expect(
            pickHabitUpdates({
                title: 'Read',
                not_a_real_column: 'x',
                target_value: undefined,
                archived_at: null,
            }),
        ).toEqual({ title: 'Read' });
    });

    it('is empty for an empty input', () => {
        expect(pickHabitUpdates({})).toEqual({});
    });
});

describe('checkHabitCategoryName', () => {
    it('trims the name', () => {
        expect(checkHabitCategoryName('  Health ')).toEqual({ name: 'Health' });
    });

    it.each([[undefined], [''], ['   ']])('rejects %j as missing', (rawName) => {
        expect(checkHabitCategoryName(rawName).code).toBe('HABIT_CATEGORY_NAME_REQUIRED');
    });

    it('rejects a name over 200 characters', () => {
        expect(checkHabitCategoryName('x'.repeat(201)).code).toBe('HABIT_CATEGORY_NAME_TOO_LONG');
    });
});

describe('pickHabitCategoryUpdates', () => {
    it('keeps only name, color and position', () => {
        expect(pickHabitCategoryUpdates({ name: 'Health', user_id: 'nope', position: 2 })).toEqual({
            name: 'Health',
            position: 2,
        });
    });
});

describe('checkHabitEntryLocalDate', () => {
    const today = '2026-10-18';

    it('accepts today', () => {
        expect(checkHabitEntryLocalDate(today, today)).toEqual({ localDate: today });
    });

    it('accepts a date within the default 30-day back-fill window', () => {
        expect(checkHabitEntryLocalDate('2026-09-18', today)).toEqual({ localDate: '2026-09-18' });
    });

    it('rejects a date older than the back-fill window', () => {
        expect(checkHabitEntryLocalDate('2026-09-17', today).code).toBe('HABIT_ENTRY_DATE_TOO_OLD');
    });

    it('rejects a date in the future', () => {
        expect(checkHabitEntryLocalDate('2026-10-19', today).code).toBe(
            'HABIT_ENTRY_DATE_IN_FUTURE',
        );
    });

    it('rejects an invalid date, including Feb 29 in a non-leap year', () => {
        expect(checkHabitEntryLocalDate('2026-02-29', today).code).toBe('HABIT_ENTRY_DATE_INVALID');
    });

    it('respects a custom back-fill window', () => {
        expect(checkHabitEntryLocalDate('2026-10-11', today, 7)).toEqual({
            localDate: '2026-10-11',
        });
        expect(checkHabitEntryLocalDate('2026-10-10', today, 7).code).toBe(
            'HABIT_ENTRY_DATE_TOO_OLD',
        );
    });
});

describe('checkHabitEntryValue', () => {
    it('normalizes a binary entry regardless of amount', () => {
        expect(checkHabitEntryValue(undefined, 'binary')).toEqual({ value: 1 });
    });

    it('accepts a zero value for a count habit (a logged zero is still a data point)', () => {
        expect(checkHabitEntryValue(0, 'count')).toEqual({ value: 0 });
    });

    it('rejects a negative value', () => {
        expect(checkHabitEntryValue(-1, 'quantity').code).toBe('HABIT_ENTRY_VALUE_INVALID');
    });

    it('rejects a missing value for a non-binary habit', () => {
        expect(checkHabitEntryValue(undefined, 'duration').code).toBe('HABIT_ENTRY_VALUE_INVALID');
    });

    it('rejects an unrecognised measure kind instead of throwing', () => {
        expect(checkHabitEntryValue(1, 'bogus').code).toBe('HABIT_INVALID_MEASURE_KIND');
    });
});

describe('checkHabitEntryBatch', () => {
    const today = '2026-10-18';

    it('validates a mixed batch of set and clear entries', () => {
        expect(
            checkHabitEntryBatch(
                [
                    { localDate: '2026-10-17', rawValue: '5' },
                    { localDate: '2026-10-16', rawValue: '' },
                ],
                'count',
                today,
            ),
        ).toEqual({
            entries: [
                { localDate: '2026-10-17', value: 5 },
                { localDate: '2026-10-16', value: null },
            ],
        });
    });

    it('rejects a non-array or empty batch', () => {
        expect(checkHabitEntryBatch([], 'count', today).code).toBe('HABIT_ENTRY_BATCH_EMPTY');
        expect(checkHabitEntryBatch(null, 'count', today).code).toBe('HABIT_ENTRY_BATCH_EMPTY');
    });

    it('rejects a batch larger than the back-fill window plus today', () => {
        const rawEntries = Array.from({ length: 32 }, (_, index) => ({
            localDate: addDaysToLocalDate(today, -index),
            rawValue: '1',
        }));
        expect(checkHabitEntryBatch(rawEntries, 'count', today).code).toBe(
            'HABIT_ENTRY_BATCH_TOO_LARGE',
        );
    });

    it('rejects a batch with the same date sent twice', () => {
        const rawEntries = [
            { localDate: '2026-10-17', rawValue: '5' },
            { localDate: '2026-10-17', rawValue: '6' },
        ];
        expect(checkHabitEntryBatch(rawEntries, 'count', today).code).toBe(
            'HABIT_ENTRY_BATCH_DUPLICATE_DATE',
        );
    });

    it('rejects the whole batch when one entry has an invalid date', () => {
        const rawEntries = [
            { localDate: '2026-10-17', rawValue: '5' },
            { localDate: '2026-10-20', rawValue: '5' },
        ];
        expect(checkHabitEntryBatch(rawEntries, 'count', today).code).toBe(
            'HABIT_ENTRY_DATE_IN_FUTURE',
        );
    });

    it('rejects the whole batch when one entry has an invalid value', () => {
        const rawEntries = [
            { localDate: '2026-10-17', rawValue: '5' },
            { localDate: '2026-10-16', rawValue: '-1' },
        ];
        expect(checkHabitEntryBatch(rawEntries, 'quantity', today).code).toBe(
            'HABIT_ENTRY_VALUE_INVALID',
        );
    });
});

describe('checkHabitEntryNote', () => {
    it('gives null for an empty or missing note (0 chars)', () => {
        expect(checkHabitEntryNote('')).toEqual({ note: null });
        expect(checkHabitEntryNote(undefined)).toEqual({ note: null });
    });

    it('accepts a realistic 300-character paste', () => {
        const paste = 'Felt tired but pushed through anyway. '.repeat(8);
        expect(checkHabitEntryNote(paste).note).toContain('Felt tired');
    });

    it('rejects a note over 2000 characters', () => {
        expect(checkHabitEntryNote('x'.repeat(2001)).code).toBe('HABIT_ENTRY_NOTE_TOO_LONG');
    });
});
