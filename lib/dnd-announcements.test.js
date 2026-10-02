import { describe, expect, it } from 'vitest';
import { buildAnnouncements, SCREEN_READER_INSTRUCTIONS } from './dnd-announcements';

const names = { t1: 'Buy milk', t2: 'Call Sam' };
const announcements = buildAnnouncements((id) => names[id]);

/** Shape dnd-kit hands to the callbacks for a sortable item. */
const sortableEntry = (id, index, total) => ({
    id,
    data: { current: { sortable: { index, items: new Array(total).fill(0) } } },
});

describe('drag announcements', () => {
    it('names the row and its position when it is picked up', () => {
        expect(announcements.onDragStart({ active: sortableEntry('t1', 1, 5) })).toBe(
            'Picked up Buy milk, position 2 of 5.',
        );
    });

    it('names the row and the position it moved to', () => {
        const message = announcements.onDragOver({
            active: sortableEntry('t1', 1, 5),
            over: sortableEntry('t2', 2, 5),
        });

        expect(message).toBe('Buy milk moved to position 3 of 5.');
    });

    it('says when the row is no longer over a place it can drop', () => {
        expect(announcements.onDragOver({ active: sortableEntry('t1', 1, 5), over: null })).toBe(
            'Buy milk is no longer over a place to drop.',
        );
    });

    it('names the row and where it was dropped', () => {
        const message = announcements.onDragEnd({
            active: sortableEntry('t1', 1, 5),
            over: sortableEntry('t2', 2, 5),
        });

        expect(message).toBe('Buy milk dropped at position 3 of 5.');
    });

    it('says the row was dropped without a new position when there is no target', () => {
        expect(announcements.onDragEnd({ active: sortableEntry('t1', 1, 5), over: null })).toBe(
            'Buy milk dropped.',
        );
    });

    it('says the move was cancelled and names the row', () => {
        expect(announcements.onDragCancel({ active: sortableEntry('t1', 1, 5) })).toBe(
            'Move cancelled. Buy milk is back where it was.',
        );
    });

    it('falls back to a plain word instead of an id when no name is known', () => {
        const message = announcements.onDragStart({ active: sortableEntry('uuid-123', 0, 2) });

        expect(message).not.toContain('uuid-123');
        expect(message).toContain('item');
    });

    it('still announces something when the position data is missing', () => {
        expect(announcements.onDragStart({ active: { id: 't1' } })).toBe('Picked up Buy milk.');
    });
});

describe('screen reader instructions', () => {
    it('explain how to pick up, move, drop and cancel with the keyboard', () => {
        const instructions = SCREEN_READER_INSTRUCTIONS.draggable.toLowerCase();

        for (const word of ['space', 'arrow', 'escape']) {
            expect(instructions).toContain(word);
        }
    });
});
