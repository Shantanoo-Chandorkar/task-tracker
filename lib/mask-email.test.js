import { describe, expect, it } from 'vitest';
import { maskEmail } from './mask-email';

describe('maskEmail', () => {
    it('keeps the first letter and the domain', () => {
        expect(maskEmail('jane.doe@gmail.com')).toBe('j***@gmail.com');
    });

    it('hides a one-letter local part completely', () => {
        expect(maskEmail('j@gmail.com')).toBe('*@gmail.com');
    });

    it('does not reveal how long the local part is', () => {
        expect(maskEmail('ab@x.com')).toBe('a***@x.com');
        expect(maskEmail('abcdefghij@x.com')).toBe('a***@x.com');
    });

    it('returns a placeholder when the value is not an email', () => {
        expect(maskEmail('not-an-email')).toBe('***');
        expect(maskEmail('')).toBe('***');
        expect(maskEmail(null)).toBe('***');
    });
});
