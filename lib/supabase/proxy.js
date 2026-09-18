import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { REMEMBER_ME_COOKIE, REMEMBER_ME_MAX_AGE_SECONDS } from '@/lib/auth/remember-me';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function createClient(request) {
    let supabaseResponse = NextResponse.next({ request: { headers: request.headers } });
    const isRemembered = request.cookies.get(REMEMBER_ME_COOKIE)?.value === '1';

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                supabaseResponse = NextResponse.next({ request });
                // Same 400-day-default problem as lib/supabase/server.js -- this refresh runs on nearly every request.
                cookiesToSet.forEach(({ name, value, options }) => {
                    const { maxAge: _maxAge, expires: _expires, ...rest } = options ?? {};
                    supabaseResponse.cookies.set(
                        name,
                        value,
                        isRemembered ? { ...rest, maxAge: REMEMBER_ME_MAX_AGE_SECONDS } : rest,
                    );
                });
            },
        },
    });

    return { supabase, supabaseResponse };
}
