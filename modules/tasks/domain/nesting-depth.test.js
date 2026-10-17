import { describe, expect, it } from 'vitest';
import { FINITE_MAX_DEPTH, NESTING_MODE, isDepthAllowed } from './nesting-depth';

describe('isDepthAllowed', () => {
    it('allows every depth up to and including the finite max', () => {
        for (let depth = 0; depth <= FINITE_MAX_DEPTH; depth++) {
            expect(isDepthAllowed(depth, 'finite')).toBe(true);
        }
    });

    it('refuses the first depth past the finite max', () => {
        expect(isDepthAllowed(FINITE_MAX_DEPTH + 1, 'finite')).toBe(false);
    });

    it('refuses depths far past the finite max', () => {
        expect(isDepthAllowed(FINITE_MAX_DEPTH + 50, 'finite')).toBe(false);
    });

    it('allows a negative depth under finite mode, since a real depth is never negative', () => {
        expect(isDepthAllowed(-1, 'finite')).toBe(true);
    });

    it('allows every depth under infinite mode, including past the finite max', () => {
        expect(isDepthAllowed(0, 'infinite')).toBe(true);
        expect(isDepthAllowed(FINITE_MAX_DEPTH, 'infinite')).toBe(true);
        expect(isDepthAllowed(FINITE_MAX_DEPTH + 100, 'infinite')).toBe(true);
    });

    it('treats any mode string other than finite as unrestricted', () => {
        expect(isDepthAllowed(FINITE_MAX_DEPTH + 1, 'unknown-mode')).toBe(true);
    });

    it('defaults to the app-wide NESTING_MODE when no mode is passed', () => {
        expect(isDepthAllowed(FINITE_MAX_DEPTH + 1)).toBe(
            isDepthAllowed(FINITE_MAX_DEPTH + 1, NESTING_MODE),
        );
    });
});

describe('NESTING_MODE and FINITE_MAX_DEPTH', () => {
    it('ships finite mode with a max depth of 2 (3 levels), the documented invariant', () => {
        expect(NESTING_MODE).toBe('finite');
        expect(FINITE_MAX_DEPTH).toBe(2);
    });
});
