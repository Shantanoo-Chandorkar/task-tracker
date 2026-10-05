import { describe, expect, it } from 'vitest';
import {
    checkPriorityFlag,
    checkTaskDescription,
    checkTaskTitle,
    nextOccurrenceIso,
    pickTaskUpdates,
} from './task-input';

describe('checkTaskTitle', () => {
    it('trims the title and strips tags', () => {
        expect(checkTaskTitle('  <b>Buy</b> milk ')).toEqual({ title: 'Buy milk' });
    });

    it.each([[undefined], [null], [42], ['   '], ['<i></i>']])(
        'rejects %j as missing',
        (rawTitle) => {
            expect(checkTaskTitle(rawTitle)).toEqual({ error: 'Title is required' });
        },
    );

    it('accepts exactly 200 characters and rejects 201', () => {
        expect(checkTaskTitle('x'.repeat(200)).title).toHaveLength(200);
        expect(checkTaskTitle('x'.repeat(201)).error).toMatch(/Title cannot exceed 200/);
    });
});

describe('checkTaskDescription', () => {
    it('gives null for an empty or missing description', () => {
        expect(checkTaskDescription('')).toEqual({ description: null });
        expect(checkTaskDescription(undefined)).toEqual({ description: null });
    });

    it('removes script tags from the description', () => {
        const { description } = checkTaskDescription('<p>Hi</p><script>alert(1)</script>');

        expect(description).toContain('Hi');
        expect(description).not.toContain('script');
    });

    it('rejects a description over 10000 characters', () => {
        expect(checkTaskDescription('x'.repeat(10001)).error).toMatch(
            /Description cannot exceed 10000/,
        );
    });
});

describe('checkPriorityFlag', () => {
    it('accepts real booleans', () => {
        expect(checkPriorityFlag(true)).toBeNull();
        expect(checkPriorityFlag(false)).toBeNull();
    });

    it.each(['true', 'false', 1, 0, null])('rejects %j with the stable code', (value) => {
        expect(checkPriorityFlag(value)).toMatchObject({ code: 'TASK_INVALID_PRIORITY' });
    });
});

describe('pickTaskUpdates', () => {
    it('keeps only allowlisted fields that were sent', () => {
        expect(
            pickTaskUpdates({
                title: 'New',
                created_by: 'x',
                list_id: 'y',
                depth: 3,
                due_date: null,
            }),
        ).toEqual({ title: 'New', due_date: null });
    });

    it('keeps false, null and empty values, but drops undefined', () => {
        expect(
            pickTaskUpdates({
                is_prioritised: false,
                description: '',
                sublist_id: null,
                status_id: undefined,
            }),
        ).toEqual({ is_prioritised: false, description: '', sublist_id: null });
    });
});

describe('nextOccurrenceIso', () => {
    it('gives an ISO timestamp for a repeating rule', () => {
        expect(nextOccurrenceIso({ freq: 'DAILY', interval: 1 })).toMatch(/^\d{4}-\d\d-\d\dT/);
    });

    it('gives null when there is no rule', () => {
        expect(nextOccurrenceIso(null)).toBeNull();
    });

    it('gives null once a limited series has used all its occurrences', () => {
        expect(nextOccurrenceIso({ freq: 'DAILY', interval: 1, count: 2 }, 5)).toBeNull();
    });
});
