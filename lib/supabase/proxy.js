import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { buildSessionCookieOptions } from '@/lib/auth/session-cookies';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function createClient(request) {
    let supabaseResponse = NextResponse.next({ request: { headers: request.headers } });

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                supabaseResponse = NextResponse.next({ request });
                cookiesToSet.forEach(({ name, value, options }) => {
                    supabaseResponse.cookies.set(name, value, buildSessionCookieOptions(options));
                });
            },
        },
    });

    return { supabase, supabaseResponse };
}
