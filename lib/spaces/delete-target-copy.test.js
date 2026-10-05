import { describe, expect, it } from 'vitest';
import { describeDeleteTarget, getDeleteToasts } from './delete-target-copy';

describe('describeDeleteTarget', () => {
    it('counts the lists and tasks a space delete would remove', () => {
        const target = { type: 'space', name: 'Home', counts: { lists: 2, tasks: 3 } };

        expect(describeDeleteTarget(target)).toEqual({
            title: 'Delete "Home"?',
            description: 'This deletes 2 lists and 3 tasks. This cannot be undone.',
            confirmLabel: 'Delete',
        });
    });

    it('uses the singular for exactly one list and one task', () => {
        const target = { type: 'space', name: 'Home', counts: { lists: 1, tasks: 1 } };

        expect(describeDeleteTarget(target).description).toBe(
            'This deletes 1 list and 1 task. This cannot be undone.',
        );
    });

    it('counts the tasks a list delete would remove', () => {
        const target = { type: 'list', name: 'Groceries', counts: { tasks: 0 } };

        expect(describeDeleteTarget(target).description).toBe(
            'This deletes 0 tasks. This cannot be undone.',
        );
    });

    it('falls back to the plain warning when the counts are not known', () => {
        expect(
            describeDeleteTarget({ type: 'space', name: 'Home', counts: null }).description,
        ).toBe('This cannot be undone.');
        expect(
            describeDeleteTarget({ type: 'list', name: 'Chores', counts: null }).description,
        ).toBe('This cannot be undone.');
    });

    it('words leaving a space as losing access, with a Leave button', () => {
        expect(describeDeleteTarget({ type: 'leave-space', name: 'Team', counts: null })).toEqual({
            title: 'Leave "Team"?',
            description: "You'll lose access to this space's lists and tasks.",
            confirmLabel: 'Leave',
        });
    });

    it('does not throw for a closed popup', () => {
        expect(describeDeleteTarget(null).confirmLabel).toBe('Delete');
    });
});

describe('getDeleteToasts', () => {
    it.each([
        ['space', 'Deleting space...', 'Space deleted'],
        ['list', 'Deleting list...', 'List deleted'],
        ['leave-space', 'Leaving space...', 'Left space'],
    ])('gives the %s texts', (type, loading, done) => {
        expect(getDeleteToasts(type)).toEqual({ loading, done });
    });
});
