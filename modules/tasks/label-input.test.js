import { describe, expect, it } from 'vitest';
import { checkLabelColor, checkLabelName } from './label-input';
import { DEFAULT_LABEL_COLOR, LABEL_NAME_MAX } from './label-limits';

describe('checkLabelName', () => {
    it('trims the name and strips tags', () => {
        expect(checkLabelName('  <b>Review</b> ', 'Status')).toEqual({
            name: 'Review',
            failure: null,
        });
    });

    it.each([undefined, null, 42, '', '   ', '<i></i>'])(
        'asks for a name when given %j',
        (rawName) => {
            expect(checkLabelName(rawName, 'Tag')).toEqual({
                name: null,
                failure: { error: 'Tag name is required' },
            });
        },
    );

    it('accepts exactly the maximum length and refuses one more, naming the kind of label', () => {
        expect(checkLabelName('x'.repeat(LABEL_NAME_MAX), 'Status').failure).toBeNull();
        expect(checkLabelName('x'.repeat(LABEL_NAME_MAX + 1), 'Status')).toEqual({
            name: null,
            failure: { error: 'Status name cannot exceed 50 characters.' },
        });
    });
});

describe('checkLabelColor', () => {
    it.each(['#6b7280', '#FFFFFF', '#00ff00', DEFAULT_LABEL_COLOR])('accepts %s', (color) => {
        expect(checkLabelColor(color)).toBeNull();
    });

    it.each([
        undefined,
        null,
        42,
        '',
        'red',
        '#fff',
        '#12345',
        '#1234567',
        '6b7280',
        '#gggggg',
        'red; background: url(x)',
        '#6b7280"><script>',
    ])('refuses %j with the stable colour code', (color) => {
        expect(checkLabelColor(color)).toEqual({
            error: 'Color must be a hex value like #6b7280',
            code: 'LABEL_COLOR_INVALID',
        });
    });
});
