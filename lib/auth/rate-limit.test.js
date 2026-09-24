import { describe, expect, it, vi } from 'vitest';

// rate-limit imports the admin client at module load, which needs real Supabase env vars
vi.mock('@/lib/supabase/admin', () => ({ createClient: vi.fn() }));

import { getClientIp } from './rate-limit';

describe('getClientIp', () => {
    it('returns the address from x-forwarded-for', () => {
        expect(getClientIp(new Headers({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
    });

    it('returns only the first address when a proxy chain is listed', () => {
        expect(
            getClientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' })),
        ).toBe('203.0.113.7');
    });

    it('trims whitespace around the address', () => {
        expect(getClientIp(new Headers({ 'x-forwarded-for': '  203.0.113.7  ' }))).toBe(
            '203.0.113.7',
        );
    });

    it('falls back to a shared bucket when the header is missing', () => {
        expect(getClientIp(new Headers())).toBe('unknown');
    });

    it('falls back to a shared bucket when the header is empty or only separators', () => {
        expect(getClientIp(new Headers({ 'x-forwarded-for': '' }))).toBe('unknown');
        expect(getClientIp(new Headers({ 'x-forwarded-for': ' , 10.0.0.1' }))).toBe('unknown');
    });
});
