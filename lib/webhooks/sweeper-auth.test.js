// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isSweeperRequestAuthorized } from './sweeper-auth';

describe('isSweeperRequestAuthorized', () => {
    const secret = 'a-long-shared-secret';

    it('accepts exactly Bearer <secret>', () => {
        expect(isSweeperRequestAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    });

    it.each([
        ['a wrong secret', 'Bearer nope'],
        ['a missing scheme', secret],
        ['a lowercase scheme', `bearer ${secret}`],
        ['a trailing space', `Bearer ${secret} `],
        ['an empty header', ''],
        ['no header', null],
    ])('rejects %s', (_label, header) => {
        expect(isSweeperRequestAuthorized(header, secret)).toBe(false);
    });

    it('rejects everything when no secret is configured, even a matching-looking header', () => {
        expect(isSweeperRequestAuthorized('Bearer undefined', undefined)).toBe(false);
        expect(isSweeperRequestAuthorized('Bearer ', '')).toBe(false);
    });
});
