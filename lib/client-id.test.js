import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClientId } from './client-id';

describe('createClientId', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('makes a different UUID each time', () => {
        const firstId = createClientId();

        expect(firstId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        expect(createClientId()).not.toBe(firstId);
    });

    it('returns nothing when the browser cannot make a UUID', () => {
        vi.stubGlobal('crypto', {});

        expect(createClientId()).toBeUndefined();
    });
});
