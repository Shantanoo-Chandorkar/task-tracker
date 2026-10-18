import { describe, expect, it } from 'vitest';
import {
    buildEditConflictMessage,
    describeTaskChanges,
    isValidVersionStamp,
} from './task-edit-conflict';

const OPENED_TASK = {
    title: 'Write report',
    description: '<p>Draft</p>',
    status_id: 'todo',
    due_date: '2030-01-01',
    is_prioritised: false,
    is_recurring: false,
    recurrence_rule: null,
};

describe('isValidVersionStamp', () => {
    it.each(['2030-01-01T10:00:00.123456+00:00', '2030-01-01T10:00:00Z'])(
        'accepts the timestamp %s',
        (versionStamp) => {
            expect(isValidVersionStamp(versionStamp)).toBe(true);
        },
    );

    it.each([undefined, null, 42, {}, '', 'yesterday-ish', 'not a date'])(
        'refuses %s',
        (versionStamp) => {
            expect(isValidVersionStamp(versionStamp)).toBe(false);
        },
    );
});

describe('describeTaskChanges', () => {
    it('names nothing when the editable fields are the same', () => {
        expect(describeTaskChanges(OPENED_TASK, { ...OPENED_TASK })).toEqual([]);
    });

    it('ignores fields the dialog does not edit, such as position and updated_at', () => {
        const currentTask = { ...OPENED_TASK, position: 9, updated_at: '2030-02-02T00:00:00Z' };

        expect(describeTaskChanges(OPENED_TASK, currentTask)).toEqual([]);
    });

    it('names every changed field with the label the user sees, in a fixed order', () => {
        const currentTask = {
            ...OPENED_TASK,
            title: 'Write the report',
            description: null,
            status_id: 'done',
            due_date: null,
            is_prioritised: true,
            is_recurring: true,
            recurrence_rule: { frequency: 'daily' },
        };

        expect(describeTaskChanges(OPENED_TASK, currentTask)).toEqual([
            'Title',
            'Description',
            'Status',
            'Due date',
            'Priority',
            'Repeat',
        ]);
    });

    it('treats an empty description and a missing one as the same', () => {
        expect(
            describeTaskChanges(
                { ...OPENED_TASK, description: '' },
                { ...OPENED_TASK, description: null },
            ),
        ).toEqual([]);
    });

    it('treats a recurrence rule with its keys in another order as unchanged', () => {
        const before = { ...OPENED_TASK, is_recurring: true, recurrence_rule: { a: 1, b: 2 } };
        const after = { ...before, recurrence_rule: { b: 2, a: 1 } };

        expect(describeTaskChanges(before, after)).toEqual([]);
    });

    it('names Repeat when only the schedule changed', () => {
        const before = { ...OPENED_TASK, is_recurring: true, recurrence_rule: { every: 1 } };
        const after = { ...before, recurrence_rule: { every: 2 } };

        expect(describeTaskChanges(before, after)).toEqual(['Repeat']);
    });
});

describe('buildEditConflictMessage', () => {
    it('lists the changed fields and says what saving again does', () => {
        expect(buildEditConflictMessage(['Title', 'Due date'])).toBe(
            'Someone changed this task while you were editing: Title, Due date. Your edits are kept. Save again to replace their version, or close to discard yours.',
        );
    });

    it('stays generic when none of the dialog fields differ', () => {
        expect(buildEditConflictMessage([])).toBe(
            'This task was changed while you were editing. Your edits are kept. Save again to replace their version, or close to discard yours.',
        );
    });
});
