import { describe, expect, it } from 'vitest';
import { sanitizeString, checkMaxLength, sanitizeRichText } from './validation';

describe('sanitizeString', () => {
    it('trims whitespace', () => {
        expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('strips HTML tags by default', () => {
        expect(sanitizeString('<b>hi</b>')).toBe('hi');
    });

    it('keeps HTML tags when shouldStripTags is false', () => {
        expect(sanitizeString('<b>hi</b>', false)).toBe('<b>hi</b>');
    });

    it('returns an empty string for non-string input', () => {
        expect(sanitizeString(null)).toBe('');
        expect(sanitizeString(undefined)).toBe('');
    });
});

describe('checkMaxLength', () => {
    it('returns null when within the limit', () => {
        expect(checkMaxLength('abc', 5, 'Name')).toBeNull();
    });

    it('returns an error object when over the limit', () => {
        expect(checkMaxLength('abcdef', 5, 'Name')).toEqual({
            error: 'Name cannot exceed 5 characters.',
            code: 'INPUT_TOO_LONG',
        });
    });
});

describe('sanitizeRichText', () => {
    it('allows the configured formatting tags', () => {
        expect(sanitizeRichText('<p><b>bold</b> and <i>italic</i></p>')).toBe(
            '<p><b>bold</b> and <i>italic</i></p>',
        );
    });

    it('strips disallowed tags and attributes', () => {
        expect(sanitizeRichText('<script>alert(1)</script><p onclick="x()">hi</p>')).toBe('<p>hi</p>');
    });

    it('forces rel="noopener noreferrer" on target="_blank" links even if omitted', () => {
        const sanitizedLinkHtml = sanitizeRichText('<a href="https://example.com" target="_blank">link</a>');
        expect(sanitizedLinkHtml).toContain('rel="noopener noreferrer"');
    });

    it('returns an empty string for non-string input', () => {
        expect(sanitizeRichText(null)).toBe('');
    });
});
