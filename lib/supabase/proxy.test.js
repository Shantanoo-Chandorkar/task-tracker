import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let capturedCookieAdapter;
vi.mock('@supabase/ssr', () => ({
    createServerClient: (url, key, options) => {
        capturedCookieAdapter = options.cookies;
        return {};
    },
}));

const { createClient } = await import('./proxy');

describe('proxy Supabase client', () => {
    it('hands back the response that holds cookies written after it was created', () => {
        const request = new NextRequest('http://localhost/anything');
        const { getSupabaseResponse } = createClient(request);
        const responseBeforeRefresh = getSupabaseResponse();

        // What Supabase does when it refreshes a token during getUser()
        capturedCookieAdapter.setAll([{ name: 'sb-token', value: 'fresh', options: {} }]);

        const responseAfterRefresh = getSupabaseResponse();
        expect(responseAfterRefresh).not.toBe(responseBeforeRefresh);
        expect(responseAfterRefresh.cookies.get('sb-token')?.value).toBe('fresh');
    });

    it('keeps a sign-out deletion (maxAge 0) as a deletion instead of a 30-day cookie', () => {
        const request = new NextRequest('http://localhost/anything');
        const { getSupabaseResponse } = createClient(request);

        capturedCookieAdapter.setAll([{ name: 'sb-token', value: '', options: { maxAge: 0, path: '/' } }]);

        const setCookieHeader = getSupabaseResponse().headers.get('set-cookie') ?? '';
        expect(setCookieHeader).toContain('sb-token=');
        expect(setCookieHeader).toMatch(/max-age=0/i);
    });
});
