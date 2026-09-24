import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { buildSessionCookieOptions } from '@/lib/auth/session-cookies';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Builds the Supabase client the proxy uses, plus a way to read the response that carries its cookie changes.
 *
 * @param {import('next/server').NextRequest} request
 * @param {Headers} [requestHeaders] - Headers to forward to the render, defaults to the request's own; pass an
 *   augmented copy (e.g. with a CSP nonce) so `setAll`'s response rebuild doesn't lose it.
 * @returns {{ supabase: object, getSupabaseResponse: () => import('next/server').NextResponse }} The response is
 *   fetched through a function because `setAll` swaps in a new one, so a value read earlier would miss its cookies.
 */
export function createClient(request, requestHeaders = request.headers) {
    let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
                cookiesToSet.forEach(({ name, value, options }) => {
                    supabaseResponse.cookies.set(name, value, buildSessionCookieOptions(options));
                });
            },
        },
    });

    return { supabase, getSupabaseResponse: () => supabaseResponse };
}
